import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { createInterface, Interface } from "node:readline";
import type { PythonCommand, PythonResponse } from "../shared/ipc";

interface PendingRequest {
  resolve: (response: PythonResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface PythonCommandArgs {
  cmd: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const REQUIREMENTS_STAMP_FILE = ".requirements.lock";

export class PythonService extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lineReader: Interface | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private shuttingDown = false;

  async start(): Promise<void> {
    if (this.process) return;

    const servicePath = this.resolveServicePath();
    const pythonExecutable = await this.ensurePythonEnvironment();
    const pythonEnv = this.buildPythonEnv();

    this.process = spawn(pythonExecutable, [servicePath], {
      cwd: path.dirname(servicePath),
      stdio: ["pipe", "pipe", "pipe"],
      env: pythonEnv,
    });

    this.process.on("error", (error) => {
      this.rejectAllPending(error);
      this.emit("error", error);
    });

    this.process.on("exit", (code, signal) => {
      if (!this.shuttingDown && code !== 0) {
        const error = new Error(`Python service exited unexpectedly (code=${code ?? "unknown"}, signal=${signal ?? "n/a"})`);
        this.rejectAllPending(error);
        this.emit("error", error);
      }
      this.cleanup();
    });

    this.lineReader = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    this.lineReader.on("line", (line) => {
      this.handlePythonLine(line);
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString();
      this.emit("stderr", message);
    });
  }

  async sendCommand({ cmd, args, timeoutMs }: PythonCommandArgs): Promise<PythonResponse> {
    if (!this.process) {
      await this.start();
    }

    const command: PythonCommand = {
      id: randomUUID(),
      cmd,
      args,
    };

    return new Promise<PythonResponse>((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        reject(new Error("Python service stdin is not writable"));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(command.id);
        reject(new Error(`Python command '${cmd}' timed out after ${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
      }, timeoutMs ?? DEFAULT_TIMEOUT_MS);

      this.pending.set(command.id, { resolve, reject, timeout });

      try {
        this.process.stdin.write(`${JSON.stringify(command)}\n`);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(command.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async dispose(): Promise<void> {
    this.shuttingDown = true;
    if (!this.process) return;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Application shutting down"));
    }
    this.pending.clear();

    this.lineReader?.close();

    if (this.process.stdin.writable) {
      this.process.stdin.end();
    }

    await new Promise<void>((resolve) => {
      const softKillTimer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill();
        }
      }, 2_000);

      const hardKillTimer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5_000);

      this.process?.once("exit", () => {
        clearTimeout(softKillTimer);
        clearTimeout(hardKillTimer);
        resolve();
      });
    });

    this.cleanup();
  }

  private async ensurePythonEnvironment(): Promise<string> {
    const runtimeRoot = this.getRuntimeRootPath();
    const venvPath = path.join(runtimeRoot, ".venv");
    const venvPython = this.getVenvPythonPath(runtimeRoot);
    const requirementsPath = this.resolveRequirementsPath();

    await fs.promises.mkdir(runtimeRoot, { recursive: true });

    if (!fs.existsSync(venvPython)) {
      const bootstrapPython = this.resolveBootstrapPythonExecutable();
      await this.runCommand(bootstrapPython, ["-m", "venv", venvPath], runtimeRoot, "create venv");
    }

    await this.installRequirementsIfNeeded(venvPython, requirementsPath, venvPath, runtimeRoot);
    return venvPython;
  }

  private async installRequirementsIfNeeded(
    venvPython: string,
    requirementsPath: string,
    venvPath: string,
    cwd: string,
  ): Promise<void> {
    if (!fs.existsSync(requirementsPath)) {
      return;
    }

    const requirementsText = fs.readFileSync(requirementsPath, "utf8");
    const normalized = requirementsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .join("\n");

    const stampPath = path.join(venvPath, REQUIREMENTS_STAMP_FILE);
    const currentStamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, "utf8") : "";
    if (currentStamp === normalized) {
      return;
    }

    await this.runCommand(venvPython, ["-m", "pip", "install", "-r", requirementsPath], cwd, "install requirements");
    await fs.promises.writeFile(stampPath, normalized, "utf8");
  }

  private async runCommand(executable: string, args: string[], cwd: string, label: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: this.buildPythonEnv(),
      });

      let stderrText = "";
      child.stdout.on("data", (chunk: Buffer) => {
        this.emit("stderr", `[python ${label}] ${chunk.toString()}`);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const message = chunk.toString();
        stderrText += message;
        this.emit("stderr", `[python ${label}] ${message}`);
      });
      child.on("error", (error) => reject(error));
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Python step failed (${label}, code=${code ?? "unknown"}): ${stderrText.trim()}`));
      });
    });
  }

  private resolveBootstrapPythonExecutable(): string {
    const overrides = [
      process.env.PYTHON_EXECUTABLE,
      process.env.PYTHON,
      process.env.PYTHON_PATH,
    ].filter((value): value is string => Boolean(value));

    for (const override of overrides) {
      if (fs.existsSync(override)) {
        return override;
      }
    }

    return process.platform === "win32" ? "python.exe" : "python3";
  }

  private getVenvPythonPath(basePath: string): string {
    const isWindows = process.platform === "win32";
    return isWindows
      ? path.join(basePath, ".venv", "Scripts", "python.exe")
      : path.join(basePath, ".venv", "bin", "python");
  }

  private handlePythonLine(line: string): void {
    if (!line.trim()) return;

    let response: PythonResponse;
    try {
      response = JSON.parse(line) as PythonResponse;
    } catch (error) {
      this.emit("error", new Error(`Failed to parse Python response: ${(error as Error).message}`));
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private cleanup(): void {
    this.lineReader?.removeAllListeners();
    this.lineReader = null;
    this.process = null;
  }

  private resolveServicePath(): string {
    const servicePath = path.join(this.getServiceBasePath(), "python", "service.py");
    if (!fs.existsSync(servicePath)) {
      throw new Error(`Python service entrypoint not found at ${servicePath}`);
    }
    return servicePath;
  }

  private resolveRequirementsPath(): string {
    return path.join(this.getServiceBasePath(), "python", "requirements.txt");
  }

  private getBasePath(): string {
    if (app.isPackaged) {
      return process.resourcesPath;
    }
    return path.resolve(__dirname, "..", "..");
  }

  private getServiceBasePath(): string {
    if (app.isPackaged) {
      return process.resourcesPath;
    }
    return this.getBasePath();
  }

  private getRuntimeRootPath(): string {
    if (app.isPackaged) {
      return path.join(app.getPath("userData"), "python-runtime");
    }
    return this.getBasePath();
  }

  private buildPythonEnv(): NodeJS.ProcessEnv {
    const runtimeRoot = this.getRuntimeRootPath();
    const venvPath = path.join(runtimeRoot, ".venv");
    const binDir = process.platform === "win32"
      ? path.join(venvPath, "Scripts")
      : path.join(venvPath, "bin");
    const pathSeparator = process.platform === "win32" ? ";" : ":";
    return {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      VIRTUAL_ENV: venvPath,
      PATH: `${binDir}${pathSeparator}${process.env.PATH ?? ""}`,
    };
  }
}
