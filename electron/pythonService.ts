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

export class PythonService extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lineReader: Interface | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private shuttingDown = false;

  async start(): Promise<void> {
    if (this.process) return;

    const pythonExecutable = this.resolvePythonExecutable();
    const servicePath = this.resolveServicePath();
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

  private resolvePythonExecutable(): string {
    const basePath = this.getBasePath();
    const isWindows = process.platform === "win32";
    const candidate = isWindows
      ? path.join(basePath, ".venv", "Scripts", "python.exe")
      : path.join(basePath, ".venv", "bin", "python");

    const overrides = [
      process.env.PYTHON_EXECUTABLE,
      process.env.PYTHON,
      process.env.PYTHON_PATH,
    ].filter((value): value is string => Boolean(value));

    if (fs.existsSync(candidate)) {
      return candidate;
    }

    for (const override of overrides) {
      if (fs.existsSync(override)) {
        return override;
      }
    }

    return isWindows ? "python.exe" : "python";
  }

  private resolveServicePath(): string {
    const servicePath = path.join(this.getBasePath(), "python", "service.py");
    if (!fs.existsSync(servicePath)) {
      throw new Error(`Python service entrypoint not found at ${servicePath}`);
    }
    return servicePath;
  }

  private getBasePath(): string {
    if (app.isPackaged) {
      return process.resourcesPath;
    }
    return path.resolve(__dirname, "..", "..");
  }

  private buildPythonEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    };
  }
}