# Setup Guide (AI Agent)

This document is a complete, self-contained recipe to scaffold a brand-new app using the same stack as the current `VideoPodcastEditor` project. The output app must:
1. Run Electron and build a Windows `.exe`.
2. Use React with the same versions.
3. Include an embedded Python service (spawned by Electron).
4. Provide a Projects Overview page with the same project system (no settings menu yet).
5. Include a drop-image tile area component like the current app.

Everything below is designed so an AI agent can execute without asking for input.

**Stack**
Pinned versions to match this app:
- `node` `>=20 <21`
- `react` `18.2.0`
- `react-dom` `18.2.0`
- `vite` `5.1.3`
- `typescript` `5.3.3`
- `@vitejs/plugin-react` `4.2.1`
- `electron` `28.2.3`
- `electron-builder` `24.9.1`
- `concurrently` `^9.2.1`
- `cross-env` `^10.1.0`
- `wait-on` `^9.0.1`
- `electronmon` `^2.0.3`
- `@types/node` `20.11.17`
- `@types/react` `18.2.37`
- `@types/react-dom` `18.2.15`

**Project Layout**
Create this layout:
```text
<new-app>/
  assets/
  electron/
    main.ts
    preload.ts
    pythonService.ts
    tsconfig.json
  public/
  python/
    service.py
    requirements.txt
  shared/
    ipc.ts
    preload.ts
  src/
    components/
      common/DropOrBrowse.tsx
      layout/NewProjectModal.tsx
    pages/
      ProjectsOverview.tsx
      ProjectPage.tsx
    services/electron.ts
    state/
      appState.tsx
      projectTemplates.ts
      types.ts
    types/electron.d.ts
    utils/
      debounce.ts
      deepClone.ts
      dnd.ts
      path.ts
      projectsIndexPaths.ts
      slug.ts
    App.tsx
    main.tsx
    styles.css
  build.bat
  electron-builder.json
  index.html
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
```

**Steps**
1. Create the new repo folder and initialize Node.
```powershell
mkdir NewElectronReactApp
cd NewElectronReactApp
npm init -y
```
2. Replace `package.json` with the exact content below.
```json
{
  "name": "new-electron-react-app",
  "version": "0.1.0",
  "description": "Electron + React + TypeScript boilerplate with embedded Python service.",
  "private": true,
  "main": "dist-electron/electron/main.js",
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=20 <21"
  },
  "scripts": {
    "build:react": "vite build",
    "build:electron": "tsc -p electron/tsconfig.json",
    "build": "npm run build:react && npm run build:electron",
    "electron:start": "electron .",
    "start": "npm run build && npm run electron:start",
    "dev": "npm exec -- concurrently -k \"npm:dev:renderer\" \"npm:dev:tsc\" \"npm:dev:electron\"",
    "dev:renderer": "vite dev",
    "dev:tsc": "tsc -p electron/tsconfig.json --watch",
    "dev:electron": "wait-on tcp:5173 dist-electron/electron/main.js && cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electronmon dist-electron/electron/main.js"
  },
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0"
  },
  "devDependencies": {
    "@types/node": "20.11.17",
    "@types/react": "18.2.37",
    "@types/react-dom": "18.2.15",
    "@vitejs/plugin-react": "4.2.1",
    "concurrently": "^9.2.1",
    "cross-env": "^10.1.0",
    "electron": "28.2.3",
    "electron-builder": "24.9.1",
    "electronmon": "^2.0.3",
    "typescript": "5.3.3",
    "vite": "5.1.3",
    "wait-on": "^9.0.1"
  }
}
```
3. Install dependencies.
```powershell
npm install
```

4. Add TypeScript and Vite config files.
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "shared"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2020",
    "outDir": "dist-electron",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["electron", "shared"],
  "exclude": ["dist-electron"]
}
```

`electron/tsconfig.json`:
```json
{
  "extends": "../tsconfig.node.json",
  "compilerOptions": {
    "rootDir": "../",
    "outDir": "../dist-electron",
    "resolveJsonModule": true
  },
  "include": ["./**/*.ts", "../shared/**/*.ts"],
  "exclude": ["../dist-electron"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```
5. Add the Vite HTML entry.
`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NewElectronReactApp</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
6. Add the Electron main process, preload, and Python service bridge.
`electron/main.ts`:
```ts
let electron = require("electron");
if (!electron.app || typeof electron.app.whenReady !== "function") {
  delete process.env.ELECTRON_RUN_AS_NODE;
  electron = require("electron");
}
const { app, BrowserWindow, dialog, ipcMain } = electron as typeof import("electron");

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { PythonResponse } from "../shared/ipc";
import type { AppPathKind, PickDirOptions, PickFileOptions } from "../shared/preload";
import { PythonService } from "./pythonService";

const fsPromises = fs.promises;
const pythonService = new PythonService();

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#141414",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    return;
  }

  const indexHtml = path.join(getBasePath(), "dist", "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`Frontend bundle not found at ${indexHtml}. Run 'npm run build:react' first.`);
  }
  void mainWindow.loadFile(indexHtml);
}

function getBasePath(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "..", "..");
}

app.whenReady().then(async () => {
  pythonService.on("stderr", (message: string) => {
    console.warn("[python stderr]", message);
  });
  pythonService.on("error", (error: Error) => {
    console.error("Python service error", error);
  });

  await pythonService.start();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void pythonService.dispose();
});

ipcMain.handle("clipboard:save-image", async (_event, buffer: ArrayBuffer) => {
  const os = require("os");
  const tempDir = os.tmpdir();
  const fileName = `clipboard_${Date.now()}.png`;
  const filePath = path.join(tempDir, fileName);
  try {
    await fsPromises.writeFile(filePath, Buffer.from(buffer));
    return filePath;
  } catch (err) {
    console.error("Failed to save clipboard image:", err);
    return null;
  }
});

ipcMain.handle("python:command", async (_event, payload: { cmd: string; args?: Record<string, unknown>; timeoutMs?: number }) => {
  try {
    const response = await pythonService.sendCommand(payload);
    return response satisfies PythonResponse;
  } catch (error) {
    return {
      id: `node-${randomUUID()}`,
      ok: false as const,
      error: {
        code: "node.error",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies PythonResponse;
  }
});

ipcMain.handle("fs:read-text", async (_event, { path: filePath }: { path: string }) => {
  return fsPromises.readFile(filePath, "utf8");
});
ipcMain.handle("fs:write-text", async (_event, { path: filePath, text }: { path: string; text: string }) => {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, text, "utf8");
});
ipcMain.handle("fs:ensure-dir", async (_event, { path: dir }: { path: string }) => {
  await fsPromises.mkdir(dir, { recursive: true });
});
ipcMain.handle("fs:exists", async (_event, { path: filePath }: { path: string }) => {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("fs:list-dir", async (_event, { path: dir }: { path: string }) => {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  return entries.map((d) => ({ name: d.name, isFile: d.isFile(), isDirectory: d.isDirectory() }));
});
ipcMain.handle("fs:stat", async (_event, { path: filePath }: { path: string }) => {
  try {
    const s = await fsPromises.stat(filePath);
    return { mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, isFile: s.isFile(), isDirectory: s.isDirectory() };
  } catch {
    return null;
  }
});

ipcMain.handle("fs:get-path", async (_event, { kind }: { kind: AppPathKind }) => {
  return app.getPath(kind);
});

ipcMain.handle("fs:normalize-paths", async (_event, { items }: { items: string[] }) => {
  const normalized = Array.from(new Set(items.map((item) => normalizePath(item)).filter(Boolean)));
  return normalized;
});

ipcMain.handle("dialog:pick-file", async (event, options: PickFileOptions = {}) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const dialogOptions: Electron.OpenDialogOptions = {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
    properties: ["openFile"],
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("dialog:pick-dir", async (event, options: PickDirOptions = {}) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const dialogOptions: Electron.OpenDialogOptions = {
    title: options.title,
    defaultPath: options.defaultPath,
    properties: ["openDirectory", "createDirectory"],
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

function normalizePath(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  if (/^file:\/\//i.test(trimmed)) {
    try {
      return path.normalize(fileURLToPath(trimmed));
    } catch {
      return path.normalize(trimmed.replace(/^file:\/\//i, ""));
    }
  }
  if (/^\\\\/.test(trimmed)) {
    return path.normalize(trimmed);
  }
  if (/^[a-zA-Z]:/.test(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.resolve(trimmed);
}
```
`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron";
import type { IElectronAPI, PickDirOptions, PickFileOptions } from "../shared/preload";
import type { PythonResponse } from "../shared/ipc";

const api: IElectronAPI & { saveClipboardImage: (buffer: ArrayBuffer) => Promise<string | null> } = {
  readText: (path) => ipcRenderer.invoke("fs:read-text", { path }),
  writeText: (path, text) => ipcRenderer.invoke("fs:write-text", { path, text }),
  ensureDir: (path) => ipcRenderer.invoke("fs:ensure-dir", { path }),
  exists: (path) => ipcRenderer.invoke("fs:exists", { path }),
  listDir: (path) => ipcRenderer.invoke("fs:list-dir", { path }),
  stat: (path) => ipcRenderer.invoke("fs:stat", { path }),
  pickFile: (options?: PickFileOptions) => ipcRenderer.invoke("dialog:pick-file", options ?? {}),
  pickDir: (options?: PickDirOptions) => ipcRenderer.invoke("dialog:pick-dir", options ?? {}),
  getPath: (kind) => ipcRenderer.invoke("fs:get-path", { kind }),
  normalizePaths: (items) => ipcRenderer.invoke("fs:normalize-paths", { items }),
  runPythonCommand: (cmd, args, options) => ipcRenderer.invoke("python:command", { cmd, args, timeoutMs: options?.timeoutMs }) as Promise<PythonResponse>,
  ping: async () => {
    const response = (await ipcRenderer.invoke("python:command", { cmd: "ping" })) as PythonResponse;
    return response.ok === true;
  },
  saveClipboardImage: (buffer: ArrayBuffer) => ipcRenderer.invoke("clipboard:save-image", buffer),
};

contextBridge.exposeInMainWorld("electronAPI", api);
```
`electron/pythonService.ts`:
```ts
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
```
7. Add shared IPC/preload types.
`shared/ipc.ts`:
```ts
export interface PythonCommand {
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
}

export interface PythonSuccessResponse {
  id: string;
  ok: true;
  data?: Record<string, unknown>;
}

export interface PythonErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface PythonErrorResponse {
  id: string;
  ok: false;
  error: PythonErrorDetail;
}

export type PythonResponse = PythonSuccessResponse | PythonErrorResponse;
```

`shared/preload.ts`:
```ts
import type { PythonResponse } from "./ipc";

export type FileFilter = { name: string; extensions: string[] };

export type DialogFileResult = string | null;

export interface PickFileOptions {
  title?: string;
  filters?: FileFilter[];
  defaultPath?: string;
}

export interface PickDirOptions {
  title?: string;
  defaultPath?: string;
}

export type AppPathKind = "userData" | "home";

export interface IElectronAPI {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean }>>;
  stat(path: string): Promise<{ mtimeMs: number; ctimeMs: number; isFile: boolean; isDirectory: boolean } | null>;
  pickFile(options: PickFileOptions): Promise<DialogFileResult>;
  pickDir(options?: PickDirOptions): Promise<DialogFileResult>;
  getPath(kind: AppPathKind): Promise<string>;
  normalizePaths(items: string[]): Promise<string[]>;
  runPythonCommand(cmd: string, args?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<PythonResponse>;
  ping(): Promise<boolean>;
}
```
8. Add the Python service.
`python/service.py`:
```py
from __future__ import annotations

import json
import logging
import sys

LOGGER = logging.getLogger("storybuilder.service")
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s", stream=sys.stderr)


def write_response(response: dict) -> None:
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def make_error_response(command_id: str | None, code: str, message: str) -> dict:
    return {
        "id": command_id or "unknown",
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }


def make_success_response(command_id: str, data: dict | None = None) -> dict:
    return {
        "id": command_id,
        "ok": True,
        "data": data or {},
    }


def handle_ping(_payload: dict) -> dict:
    return {"message": "pong"}


COMMANDS = {
    "ping": handle_ping,
}


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            command = json.loads(line)
        except json.JSONDecodeError as exc:
            write_response(make_error_response(None, "invalid_json", f"Could not parse JSON: {exc}"))
            continue

        command_id = command.get("id")
        cmd = command.get("cmd")
        payload = command.get("args") or {}

        if not command_id:
            write_response(make_error_response(None, "invalid_request", "Missing field: id"))
            continue
        if not cmd:
            write_response(make_error_response(command_id, "invalid_request", "Missing field: cmd"))
            continue

        handler = COMMANDS.get(cmd)
        if handler is None:
            write_response(make_error_response(command_id, "unknown_command", f"Unknown command: {cmd}"))
            continue

        try:
            result_payload = handler(payload)
        except Exception as exc:
            LOGGER.exception("Unexpected error")
            write_response(make_error_response(command_id, "internal_error", str(exc)))
        else:
            write_response(make_success_response(command_id, result_payload))


if __name__ == "__main__":
    main()
```

`python/requirements.txt`:
```txt
# Minimal dependencies for the embedded service
# Add your own requirements as needed.
```
9. Set up the Python virtual environment.
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
```
10. Add the project system, overview page, and drop image component.

`src/types/electron.d.ts`:
```ts
import type { IElectronAPI } from "../../shared/preload";

declare global {
  interface Window {
    electronAPI: IElectronAPI & {
      saveClipboardImage: (buffer: ArrayBuffer) => Promise<string | null>;
    };
  }
}

export {};
```

`src/services/electron.ts`:
```ts
import type { IElectronAPI } from "../../shared/preload";
import type { PythonResponse } from "../../shared/ipc";

function getElectron(): IElectronAPI {
  if (!window.electronAPI) {
    throw new Error("Electron preload bridge is not available.");
  }
  return window.electronAPI;
}

export const electron = {
  readText(path: string): Promise<string> {
    return getElectron().readText(path);
  },
  writeText(path: string, text: string): Promise<void> {
    return getElectron().writeText(path, text);
  },
  ensureDir(path: string): Promise<void> {
    return getElectron().ensureDir(path);
  },
  exists(path: string): Promise<boolean> {
    return getElectron().exists(path);
  },
  listDir(path: string): ReturnType<IElectronAPI["listDir"]> {
    return getElectron().listDir(path);
  },
  stat(path: string): ReturnType<IElectronAPI["stat"]> {
    return getElectron().stat(path);
  },
  pickFile(options: Parameters<IElectronAPI["pickFile"]>[0]): ReturnType<IElectronAPI["pickFile"]> {
    return getElectron().pickFile(options);
  },
  pickDir(options?: Parameters<IElectronAPI["pickDir"]>[0]): ReturnType<IElectronAPI["pickDir"]> {
    return getElectron().pickDir(options);
  },
  getPath(kind: Parameters<IElectronAPI["getPath"]>[0]): Promise<string> {
    return getElectron().getPath(kind);
  },
  normalizePaths(items: string[]): Promise<string[]> {
    return getElectron().normalizePaths(items);
  },
  runPythonCommand(cmd: string, args?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<PythonResponse> {
    return getElectron().runPythonCommand(cmd, args, options);
  },
} as const;

export type Electron = typeof electron;
```
`src/utils/path.ts`:
```ts
export function getDirectoryName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return ".";
  }
  return normalized.slice(0, lastSlash);
}

export function joinPath(base: string, segment: string): string {
  if (!base.endsWith("/") && !base.endsWith("\\")) {
    return `${base.replace(/[/\\]+$/, "")}/${segment}`;
  }
  return `${base}${segment}`;
}

export function toFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  let s = String(filePath).replace(/\\/g, "/");
  if (!s.startsWith("/")) {
    s = `/${s}`;
  }
  return `file://${s}`;
}
```

`src/utils/slug.ts`:
```ts
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
```

`src/utils/projectsIndexPaths.ts`:
```ts
let projectsRootPath: string | null = null;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function normalizeAbsolute(value: string): string {
  let normalized = normalizeSlashes(value.trim());
  if (!normalized) return "";
  if (/^[a-zA-Z]:$/.test(normalized)) {
    normalized += "/";
  }
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1);
  }
  return trimTrailingSlash(normalized);
}

function resolveWithRoot(relative: string): string {
  const root = projectsRootPath;
  if (!root) {
    return normalizeAbsolute(relative);
  }
  const cleanedRelative = normalizeSlashes(relative).replace(/^\/+/, "");
  const rootNormalized = normalizeAbsolute(root);
  return normalizeAbsolute(`${rootNormalized}/${cleanedRelative}`);
}

export function setProjectsRoot(root: string | null): void {
  projectsRootPath = root ? normalizeAbsolute(root) : null;
}

export function resolveProjectsIndexLocation(location: string): string {
  if (!location) {
    return projectsRootPath ?? "";
  }
  if (isAbsolutePath(location)) {
    return normalizeAbsolute(location);
  }
  return resolveWithRoot(location);
}

export function toProjectsIndexRelative(path: string): string {
  const root = projectsRootPath;
  if (!path) {
    return "";
  }
  const normalized = normalizeAbsolute(path);
  if (!root) {
    return normalized;
  }
  const rootNormalized = normalizeAbsolute(root);
  if (normalized.toLowerCase().startsWith(`${rootNormalized.toLowerCase()}/`)) {
    const relative = normalized.slice(rootNormalized.length + 1);
    return normalizeSlashes(relative);
  }
  return normalizeSlashes(path);
}

export function resolveProjectJsonPath(location: string): string {
  const absolute = resolveProjectsIndexLocation(location);
  if (absolute.toLowerCase().endsWith(".json")) {
    return absolute;
  }
  return `${absolute}/project.json`;
}
```
`src/utils/debounce.ts`:
```ts
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wrapped = (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped;
}
```

`src/utils/deepClone.ts`:
```ts
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
```

`src/utils/dnd.ts`:
```ts
import type { DragEvent } from "react";

export async function extractPathsFromDrop(event: DragEvent<HTMLElement>): Promise<string[]> {
  event.preventDefault();
  event.stopPropagation();

  const items = new Set<string>();
  const { dataTransfer } = event;
  if (!dataTransfer) return [];

  if (dataTransfer.files?.length) {
    Array.from(dataTransfer.files).forEach((file) => {
      const withPath = file as File & { path?: string };
      if (withPath.path) {
        items.add(withPath.path);
      }
    });
  }

  const plain = dataTransfer.getData("text/plain");
  if (plain) items.add(plain.trim());

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => items.add(line));
  }

  if (items.size === 0) return [];

  try {
    return await window.electronAPI.normalizePaths(Array.from(items));
  } catch (error) {
    console.error("Failed to normalize dropped paths", error);
    return Array.from(items);
  }
}

export function handleDragOver(event: DragEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}
```
`src/components/common/DropOrBrowse.tsx`:
```tsx
import React, { useEffect, useRef } from "react";
import { extractPathsFromDrop, handleDragOver } from "../../utils/dnd";

const ImageIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
    <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 14l2.5-3 3 4 2-2 2.5 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9" cy="10" r="1.5" fill="currentColor" />
  </svg>
);

export interface DropOrBrowseProps {
  label?: string;
  onPathsSelected: (paths: string[]) => void;
  browse?: () => Promise<string | string[] | null | undefined>;
  className?: string;
}

export function DropOrBrowse({ label = "Drop or Browse", onPathsSelected, browse, className = "card__dropzone" }: DropOrBrowseProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handlePaste = async (event: ClipboardEvent) => {
      event.preventDefault();
      if (!event.clipboardData) return;

      const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const tempPath = await window.electronAPI.saveClipboardImage(buffer);
        if (tempPath) {
          onPathsSelected([tempPath]);
        }
      } catch (error) {
        console.error("Failed to handle pasted image:", error);
      }
    };

    element.addEventListener("paste", handlePaste);
    return () => {
      element.removeEventListener("paste", handlePaste);
    };
  }, [onPathsSelected]);

  const onClick = async () => {
    if (!browse) return;
    const result = await browse();
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const filtered = paths.filter(Boolean) as string[];
    if (filtered.length) onPathsSelected(filtered);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragOver={handleDragOver}
      onDrop={async (e) => {
        const files = await extractPathsFromDrop(e);
        if (files.length) onPathsSelected(files);
      }}
      style={{ cursor: browse ? "pointer" : "default" }}
      onContextMenu={async (e) => {
        e.preventDefault();
        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.background = "#222";
        menu.style.color = "#fff";
        menu.style.padding = "8px 16px";
        menu.style.borderRadius = "6px";
        menu.style.zIndex = "9999";
        menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        menu.style.cursor = "pointer";
        menu.textContent = "Paste";
        menu.onclick = async () => {
          menu.remove();
          try {
            const clipboardItems = await navigator.clipboard.read();
            const imageItem = clipboardItems.find(item => item.types.some(type => type.startsWith("image/")));
            if (imageItem) {
              const blob = await imageItem.getType(imageItem.types.find(type => type.startsWith("image/"))!);
              const buffer = await blob.arrayBuffer();
              const tempPath = await window.electronAPI.saveClipboardImage(buffer);
              if (tempPath) {
                onPathsSelected([tempPath]);
              }
            }
          } catch (err) {
            console.error("Failed to paste image from clipboard:", err);
          }
        };
        document.body.appendChild(menu);
        const removeMenu = () => menu.remove();
        setTimeout(() => {
          document.addEventListener("click", removeMenu, { once: true });
        }, 0);
      }}
    >
      <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
        <span aria-hidden>{ImageIcon}</span>
        <div>{label}</div>
      </div>
    </div>
  );
}
```
`src/state/types.ts`:
```ts
export interface ProjectState {
  schema: string;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  lastModified: string;
  paths: {
    root: string;
  };
  images?: string[];
}

export interface ProjectsIndexEntry {
  id: string;
  name: string;
  location: string;
  lastModified: string;
  lastUpdated: string;
}

export interface ProjectsIndex {
  projects: ProjectsIndexEntry[];
}

export interface AppState {
  projectsIndex: ProjectsIndex | null;
  projectsRootPath: string | null;
  project: ProjectState | null;
  projectFilePath: string | null;
  loading: boolean;
  lastError: string | null;
}

export type ProjectUpdater = (project: ProjectState) => void;

export interface AppStateContextValue extends AppState {
  setProjectsRootPath: (path: string) => Promise<string | undefined>;
  loadProjectsIndex: (path: string) => Promise<void>;
  loadProject: (path: string) => Promise<void>;
  closeProject: () => void;
  updateProject: (updater: ProjectUpdater) => void;
  updateProjectsIndex: (
    updater: (current: ProjectsIndex | null) => ProjectsIndex | null,
  ) => Promise<void>;
}
```

`src/state/projectTemplates.ts`:
```ts
import type { ProjectState, ProjectsIndexEntry } from "./types";

function randomId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createProjectState(params: { name: string; rootPath: string; description?: string }): ProjectState {
  const { name, rootPath, description = "" } = params;
  const id = randomId();
  const now = new Date().toISOString();

  return {
    schema: "storybuilder.project/v1",
    id,
    name,
    description,
    createdAt: now,
    lastModified: now,
    paths: {
      root: rootPath,
    },
    images: [],
  };
}

export function buildProjectsIndexEntry(project: ProjectState, location: string): ProjectsIndexEntry {
  return {
    id: project.id,
    name: project.name,
    location,
    lastModified: project.lastModified,
    lastUpdated: project.lastModified,
  };
}
```

`src/services/projectService.ts`:
```ts
import { joinPath } from "../utils/path";
import { slugify } from "../utils/slug";
import { electron } from "./electron";
import { buildProjectsIndexEntry } from "../state/projectTemplates";
import type { ProjectState, ProjectsIndexEntry } from "../state/types";
import { resolveProjectJsonPath, resolveProjectsIndexLocation, toProjectsIndexRelative } from "../utils/projectsIndexPaths";

export function normalizePathForCompare(value: string): string {
  return resolveProjectsIndexLocation(value).replace(/[\\/]+/g, "/").toLowerCase();
}

export function resolveProjectFilePath(entry: ProjectsIndexEntry): string {
  return resolveProjectJsonPath(entry.location);
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await electron.ensureDir(dirPath);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("ensureDir"))) {
      throw error;
    }
    const placeholder = joinPath(dirPath, ".keep");
    await electron.writeText(placeholder, "");
  }
}

const PROJECT_SUBDIRECTORIES = [
  "Speakers",
  "MediaAssets",
  "Renders"
] as const;

async function ensureProjectStructure(projectDir: string): Promise<void> {
  await ensureDirectoryExists(projectDir);
  await Promise.all(PROJECT_SUBDIRECTORIES.map((dir) => ensureDirectoryExists(joinPath(projectDir, dir))));
}

async function ensureUniqueSlug(rootPath: string, slug: string): Promise<string> {
  let attempt = slug;
  let counter = 1;
  while (await electron.exists(joinPath(rootPath, attempt))) {
    counter += 1;
    attempt = `${slug}-${counter}`;
  }
  return attempt;
}

export interface CreateProjectWorkspaceOptions {
  name: string;
  rootPath: string;
  createState: (params: { name: string; rootPath: string }) => ProjectState;
}

export interface CreateProjectWorkspaceResult {
  projectDir: string;
  projectFile: string;
  state: ProjectState;
  indexEntry: ProjectsIndexEntry;
  slug: string;
}

export async function createProjectWorkspace({
  name,
  rootPath,
  createState,
}: CreateProjectWorkspaceOptions): Promise<CreateProjectWorkspaceResult> {
  const baseSlug = slugify(name) || `project-${Date.now()}`;
  const slug = await ensureUniqueSlug(rootPath, baseSlug);
  const projectDir = joinPath(rootPath, slug);
  await ensureProjectStructure(projectDir);

  const state = createState({ name, rootPath: projectDir });
  const projectFile = joinPath(projectDir, "project.json");
  await electron.writeText(projectFile, JSON.stringify(state, null, 2));

  const indexEntry = buildProjectsIndexEntry(state, toProjectsIndexRelative(projectDir));
  return { projectDir, projectFile, state, indexEntry, slug };
}
```
`src/state/appState.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppStateContextValue, ProjectState, ProjectsIndex } from "./types";
import { debounce } from "../utils/debounce";
import { deepClone } from "../utils/deepClone";
import { getDirectoryName, joinPath } from "../utils/path";
import { electron } from "../services/electron";
import { ensureDirectoryExists } from "../services/projectService";
import { resolveProjectsIndexLocation, setProjectsRoot, toProjectsIndexRelative } from "../utils/projectsIndexPaths";

const DEFAULT_AUTOSAVE_DELAY_MS = 500;
const LOCAL_STORAGE_ROOT_PATH_KEY = "storybuilder.projectsRootPath";
const DEFAULT_PROJECTS_ROOT = "D:/Storyboards";
const EMPTY_PROJECTS_INDEX: ProjectsIndex = { projects: [] };

const AppStateContext = createContext<AppStateContextValue | null>(null);

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function scanProjects(rootPath: string): Promise<ProjectsIndex> {
  try {
    const entries = await electron.listDir(rootPath);
    const projects = [] as ProjectsIndex["projects"];
    for (const e of entries) {
      if (!e.isDirectory) continue;
      const dir = joinPath(rootPath, e.name);
      const pj = joinPath(dir, "project.json");
      const hasProject = await electron.exists(pj);
      if (!hasProject) continue;
      try {
        const text = await electron.readText(pj);
        const parsed = JSON.parse(text) as ProjectState;
        const stat = await electron.stat(pj);
        const last = parsed.lastModified ?? (stat ? new Date(stat.mtimeMs).toISOString() : new Date().toISOString());
        const abs = resolveProjectsIndexLocation(dir);
        const rel = toProjectsIndexRelative(abs);
        const id = `p-${hashString(abs.toLowerCase())}`;
        projects.push({
          id,
          name: parsed.name || e.name,
          location: rel,
          lastModified: last,
          lastUpdated: last,
        });
      } catch {
        // ignore broken project.json
      }
    }
    return { projects };
  } catch (error) {
    console.error("Failed to scan projects", error);
    return EMPTY_PROJECTS_INDEX;
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [projectsIndex, setProjectsIndex] = useState<ProjectsIndex | null>(null);
  const [projectsRootPath, setProjectsRootPathState] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [projectFilePath, setProjectFilePathState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const projectPathRef = useRef<string | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const dirtyRef = useRef(false);

  const readFile = useCallback((filePath: string) => electron.readText(filePath), []);
  const writeFile = useCallback((filePath: string, text: string) => electron.writeText(filePath, text), []);

  const loadProjectsIndex = useCallback(async (indexPath: string) => {
    setLoading(true);
    setLastError(null);
    const root = indexPath.toLowerCase().endsWith("projects.json") ? getDirectoryName(indexPath) : indexPath;
    try {
      const scanned = await scanProjects(root);
      const normalized = scanned.projects.map((entry) => ({
        ...entry,
        location: toProjectsIndexRelative(resolveProjectsIndexLocation(entry.location)),
      }));
      setProjectsIndex({ projects: normalized });
    } catch (error) {
      console.error("Failed to load projects index", error);
      setLastError(error instanceof Error ? error.message : String(error));
      setProjectsIndex(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(async (filePath: string) => {
    setLoading(true);
    setLastError(null);
    try {
      const content = await readFile(filePath);
      const parsed = JSON.parse(content) as ProjectState;
      projectPathRef.current = filePath;
      projectRef.current = parsed;
      setProject(parsed);
      setProjectFilePathState(filePath);
      dirtyRef.current = false;
    } catch (error) {
      console.error("Failed to load project", error);
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [readFile]);

  const persistProject = useCallback(async (draft: ProjectState | null) => {
    if (!draft || !projectPathRef.current) return;
    try {
      await writeFile(projectPathRef.current, JSON.stringify(draft, null, 2));
      dirtyRef.current = false;
    } catch (error) {
      console.error("Failed to save project", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [writeFile]);

  const autosaveRef = useRef(
    debounce(async () => {
      if (dirtyRef.current) {
        await persistProject(projectRef.current);
      }
    }, DEFAULT_AUTOSAVE_DELAY_MS)
  );

  const updateProject = useCallback((updater: (draft: ProjectState) => void) => {
    setProject((previous) => {
      if (!previous) return previous;
      const clone = deepClone(previous);
      updater(clone);
      clone.lastModified = new Date().toISOString();
      dirtyRef.current = true;
      projectRef.current = clone;
      autosaveRef.current();
      return clone;
    });
  }, []);

  const closeProject = useCallback(() => {
    projectPathRef.current = null;
    projectRef.current = null;
    setProject(null);
    setProjectFilePathState(null);
  }, []);

  const setProjectsRootPath = useCallback(async (root: string) => {
    if (!root) return undefined;
    try {
      await ensureDirectoryExists(root);
      setProjectsRoot(root);
      const scanned = await scanProjects(root);
      setProjectsIndex(scanned);
      setProjectsRootPathState(root);
      try {
        localStorage.setItem(LOCAL_STORAGE_ROOT_PATH_KEY, root);
      } catch (error) {
        console.warn("Failed to persist projects root", error);
      }
      return root;
    } catch (error) {
      console.error("Failed to set projects root", error);
      setLastError(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }, []);

  const updateProjectsIndex = useCallback(
    async (_updater: (current: ProjectsIndex | null) => ProjectsIndex | null) => {
      const root = projectsRootPath;
      if (!root) {
        setLastError("Projects root path is not configured.");
        return;
      }
      const scanned = await scanProjects(root);
      setProjectsIndex(scanned);
    },
    [projectsRootPath]
  );

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => () => autosaveRef.current.cancel(), []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      let storedRoot: string | null = null;
      try {
        storedRoot = localStorage.getItem(LOCAL_STORAGE_ROOT_PATH_KEY);
      } catch (error) {
        console.warn("Failed to read stored root path", error);
      }

      let initialRoot = storedRoot ?? DEFAULT_PROJECTS_ROOT;
      if (!storedRoot) {
        try {
          const homeDir = await electron.getPath("home");
          initialRoot = joinPath(homeDir, "Storyboards");
        } catch (error) {
          console.warn("Failed to resolve home directory", error);
        }
      }
      if (mounted) {
        await setProjectsRootPath(initialRoot);
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [setProjectsRootPath]);

  const value = useMemo<AppStateContextValue>(() => ({
    projectsIndex,
    projectsRootPath,
    project,
    projectFilePath,
    loading,
    lastError,
    setProjectsRootPath,
    loadProjectsIndex,
    loadProject,
    closeProject,
    updateProjectsIndex,
    updateProject,
  }), [projectsIndex, projectsRootPath, project, projectFilePath, loading, lastError, setProjectsRootPath, loadProjectsIndex, loadProject, closeProject, updateProjectsIndex, updateProject]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
```
`src/components/layout/NewProjectModal.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("New Project");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.select(), 0);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    try {
      setBusy(true);
      await onCreate(trimmed);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Create new project</h3>
        </div>
        <div className="form-section">
          <label className="form-row">
            <h2 className="section-title">Project name</h2>
            <input
              ref={inputRef}
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </label>
        </div>
        <div className="modal__footer">
          <button className="pill-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="pill-button" type="button" onClick={submit} disabled={busy || !name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
}
```

`src/pages/ProjectsOverview.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { ProjectsIndex, ProjectsIndexEntry } from "../state/types";
import { NewProjectModal } from "../components/layout/NewProjectModal";
import { joinPath, toFileUrl } from "../utils/path";
import { resolveProjectsIndexLocation } from "../utils/projectsIndexPaths";

const PlusIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const RefreshIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 4v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

interface ProjectsOverviewProps {
  projectsIndex: ProjectsIndex | null;
  rootPath: string | null;
  loading: boolean;
  lastError: string | null;
  onOpenProject: (entry: ProjectsIndexEntry) => void;
  onCreateProject: (name: string) => void | Promise<void>;
  onChangeRootPath: () => void;
  onReload: () => void | Promise<void>;
}

export function ProjectsOverview({
  projectsIndex,
  rootPath,
  loading,
  lastError,
  onOpenProject,
  onCreateProject,
  onChangeRootPath,
  onReload,
}: ProjectsOverviewProps) {
  const projects = projectsIndex?.projects ?? [];
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    try {
      void window.electronAPI.ping();
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="page projects-overview">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Choose an existing project or create a new workspace.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={onReload} title="Reload">
            <span className="icon">{RefreshIcon}</span>
            Reload
          </button>
          <button type="button" onClick={onChangeRootPath}>
            Change Root
          </button>
          <button type="button" onClick={() => setNewOpen(true)}>
            <span className="icon">{PlusIcon}</span>
            New Project
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div className="panel-meta">
            <span className="label">Projects root</span>
            <span className="value">{rootPath ?? "Not configured"}</span>
          </div>
        </div>

        {lastError ? <p className="error">{lastError}</p> : null}
        {loading ? <p>Loading projects...</p> : null}

        <div className="projects-grid">
          <button className="project-tile project-tile--new" type="button" onClick={() => setNewOpen(true)}>
            <div className="project-tile__frame">
              <span className="project-tile__plus">{PlusIcon}</span>
            </div>
            <span className="project-tile__name">New Project</span>
            <span className="project-tile__meta">Create in root directory</span>
          </button>

          {projects.map((p) => {
            const resolvedLocation = resolveProjectsIndexLocation(p.location);
            const displayLocation = p.location;
            const speakersDir = joinPath(resolvedLocation, "Speakers");
            const preferredOrder = ["close", "medium", "wide"] as const;
            const guessFiles: string[] = [];
            for (let i = 1; i <= 4; i++) {
              for (const shot of preferredOrder) {
                for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
                  guessFiles.push(joinPath(speakersDir, `${i}_${shot}_1${ext}`));
                }
              }
            }
            const candidateSrcs = guessFiles.map((f) => toFileUrl(f));

            return (
              <button
                key={p.id}
                className="project-tile"
                type="button"
                onClick={() => onOpenProject(p)}
              >
                <div className="project-tile__frame" style={{ position: "relative", overflow: "hidden" }}>
                  <span className="project-tile__plus" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{PlusIcon}</span>
                  {candidateSrcs.slice(0, 8).map((src, idx) => (
                    <img
                      key={`${src}-${idx}`}
                      src={src}
                      alt=""
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 12, display: "block" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ))}
                </div>
                <span className="project-tile__name" style={{ textAlign: "center", width: "100%" }}>{p.name}</span>
                <span className="project-tile__meta" style={{ textAlign: "center", width: "100%" }}>{displayLocation}</span>
                <span className="project-tile__timestamp" style={{ textAlign: "center", width: "100%" }}>
                  Updated {new Date(p.lastUpdated).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={onCreateProject} />
    </div>
  );
}
```

`src/pages/ProjectPage.tsx`:
```tsx
import { useMemo } from "react";
import type { ProjectState } from "../state/types";
import { DropOrBrowse } from "../components/common/DropOrBrowse";
import { toFileUrl } from "../utils/path";
import { useAppState } from "../state/appState";

interface ProjectPageProps {
  project: ProjectState;
}

export function ProjectPage({ project }: ProjectPageProps) {
  const { updateProject, closeProject } = useAppState();
  const images = useMemo(() => project.images ?? [], [project.images]);

  return (
    <div className="page project-page">
      <header className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="page-subtitle">Drop images below to attach them to the project.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={closeProject}>Back to Projects</button>
        </div>
      </header>

      <section className="panel">
        <h2 className="section-title">Image Drop Tile</h2>
        <DropOrBrowse
          label="Drop images here or Browse"
          onPathsSelected={(paths) => {
            if (!paths.length) return;
            updateProject((draft) => {
              const current = Array.isArray(draft.images) ? draft.images.slice() : [];
              draft.images = [...current, ...paths];
            });
          }}
          browse={async () => {
            const picked = await window.electronAPI.pickFile({
              title: "Select image",
              filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
            });
            if (picked) {
              updateProject((draft) => {
                const current = Array.isArray(draft.images) ? draft.images.slice() : [];
                draft.images = [...current, picked];
              });
            }
            return picked;
          }}
        />
        {images.length > 0 ? (
          <div className="image-grid">
            {images.map((path, index) => (
              <div key={`${path}-${index}`} className="image-tile">
                <img src={toFileUrl(path)} alt="" />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No images added yet.</p>
        )}
      </section>
    </div>
  );
}
```
`src/App.tsx`:
```tsx
import { useCallback, useMemo } from "react";
import { ProjectsOverview } from "./pages/ProjectsOverview";
import { ProjectPage } from "./pages/ProjectPage";
import { useAppState } from "./state/appState";
import { createProjectState } from "./state/projectTemplates";
import type { ProjectsIndexEntry } from "./state/types";
import { createProjectWorkspace, normalizePathForCompare, resolveProjectFilePath } from "./services/projectService";
import { electron } from "./services/electron";

export default function App() {
  const {
    projectsIndex,
    projectsRootPath,
    project,
    loading,
    lastError,
    setProjectsRootPath,
    loadProject,
    updateProjectsIndex,
  } = useAppState();

  const handleChangeRootPath = useCallback(async () => {
    const picked = await electron.pickDir({
      title: "Select projects root",
      defaultPath: projectsRootPath ?? undefined,
    });
    if (!picked) return undefined;
    return await setProjectsRootPath(picked);
  }, [projectsRootPath, setProjectsRootPath]);

  const handleOpenProject = useCallback(async (entry: ProjectsIndexEntry) => {
    const projectPath = resolveProjectFilePath(entry);
    await loadProject(projectPath);
  }, [loadProject]);

  const handleCreateProject = useCallback(async (nameFromUI?: string) => {
    const ensureRoot = async (): Promise<string | undefined> => {
      if (projectsRootPath) return projectsRootPath;
      const picked = await handleChangeRootPath();
      return picked ?? undefined;
    };

    const root = await ensureRoot();
    if (!root) return;

    const name = nameFromUI?.trim();
    if (!name) return;

    try {
      const { projectDir, projectFile, indexEntry } = await createProjectWorkspace({
        name,
        rootPath: root,
        createState: createProjectState,
      });

      await updateProjectsIndex((current): typeof projectsIndex => {
        const index = current ?? { projects: [] };
        const normalizedDir = normalizePathForCompare(projectDir);
        const filtered = index.projects.filter((item) => normalizePathForCompare(item.location) !== normalizedDir);
        return { projects: [indexEntry, ...filtered] };
      });

      await loadProject(projectFile);
    } catch (error) {
      console.error("Failed to create project", error);
      alert(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectsRootPath, handleChangeRootPath, updateProjectsIndex, loadProject, projectsIndex]);

  const content = useMemo(() => {
    if (!project) {
      return (
        <ProjectsOverview
          projectsIndex={projectsIndex}
          rootPath={projectsRootPath}
          loading={loading}
          lastError={lastError}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onChangeRootPath={handleChangeRootPath}
          onReload={async () => {
            await updateProjectsIndex((current) => current);
          }}
        />
      );
    }
    return <ProjectPage project={project} />;
  }, [project, projectsIndex, projectsRootPath, loading, lastError, handleOpenProject, handleCreateProject, handleChangeRootPath]);

  return (
    <div className="app-root">
      <main className="app-content">{content}</main>
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { AppStateProvider } from "./state/appState";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </React.StrictMode>
);
```

`src/styles.css`:
```css
:root {
  color-scheme: dark;
  --color-bg-01: #141414;
  --color-bg-02: #1b1c1d;
  --color-bg-03: #242628;
  --color-text: #e6e7e8;
  --color-text-muted: #aeb2b7;
  --color-tab-active: #f85f42;
  --color-card: #242628;
  --color-danger: #ff6b6b;
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  background-color: var(--color-bg-01);
  color: var(--color-text);
}

button { font-family: inherit; cursor: pointer; }

.app-root { min-height: 100vh; display: flex; flex-direction: column; background-color: var(--color-bg-01); }
.app-content { flex: 1; }

.page { display: flex; flex-direction: column; gap: 24px; margin: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.page-header h1 { margin: 0; font-size: 32px; font-weight: 600; }
.page-subtitle { margin: 4px 0 0; color: var(--color-text-muted); font-size: 14px; }
.page-header .actions { display: flex; gap: 14px; }
.page-header .actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: 999px;
  border: 1px solid rgba(226, 231, 232, 0.24);
  background: rgba(18, 19, 20, 0.85);
  color: rgba(226, 231, 232, 0.76);
  font-size: 14px;
}
.page-header .actions button:hover:not(:disabled) {
  border-color: rgba(248, 95, 66, 0.6);
  color: var(--color-tab-active);
  background: rgba(248, 95, 66, 0.12);
}

.panel {
  background: #212126;
  border-radius: 18px;
  border: none;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.panel-header { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; color: var(--color-text-muted); }
.panel-meta { display: flex; flex-direction: column; gap: 2px; }
.panel-meta .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.45); }
.panel-meta .value { font-family: "Cascadia Mono", "Consolas", monospace; font-size: 12px; color: var(--color-text); }

.projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
.project-tile {
  background: #1a1c1f;
  border: none;
  border-radius: 16px;
  padding: 20px;
  text-align: left;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.project-tile:hover { transform: translateY(-3px); box-shadow: 0 2px 2px rgba(58, 166, 255, 0.18); }
.project-tile--new { align-items: center; justify-content: flex-start; text-align: center; }
.project-tile__frame { width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; display: grid; place-items: center; background: rgba(58, 166, 255, 0.08); margin-bottom: 12px; }
.project-tile__plus { display: inline-flex; align-items: center; justify-content: center; color: var(--color-tab-active); }
.project-tile__plus svg { width: 38px; height: 38px; }
.project-tile__name { font-size: 18px; font-weight: 600; }
.project-tile__meta { font-size: 13px; color: var(--color-text-muted); }
.project-tile__timestamp { font-size: 12px; color: rgba(255, 255, 255, 0.35); }

.card__dropzone {
  border: none;
  background: #1a1c1f;
  color: var(--color-text-muted);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}
.card__dropzone:hover { background: rgba(255,255,255,0.06); }

.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }
.image-tile { background: var(--color-card); border-radius: 12px; padding: 8px; }
.image-tile img { width: 100%; height: 140px; object-fit: cover; border-radius: 8px; display: block; }

.form-section { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-input { width: 100%; background-color: #1a1c1f; color: var(--color-text); border: none; border-radius: 10px; padding: 10px 12px; font-size: 14px; }

.section-title { margin: 0 0 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
.error { padding: 12px 16px; border-radius: 10px; background-color: rgba(255, 107, 107, 0.12); color: var(--color-danger); font-size: 14px; }
.muted { color: var(--color-text-muted); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--color-card); border: none; border-radius: 12px; width: min(720px, 95vw); max-height: 90vh; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.modal__header { display: flex; align-items: center; justify-content: space-between; }
.modal__title { margin: 0; font-size: 18px; font-weight: 600; }
.modal__footer { display: flex; justify-content: flex-end; gap: 8px; }
.pill-button { border: 1px solid #454748; background: rgba(18,19,20,0.85); color: rgba(226,231,232,0.86); border-radius: 999px; padding: 8px 16px; font-size: 14px; }
.pill-button:hover { border-color: #3aa6ff; color: #3aa6ff; background: rgba(58,166,255,0.12); }
```
11. Add the Electron build configuration and batch file.
`electron-builder.json`:
```json
{
  "appId": "com.example.newelectronreactapp",
  "productName": "NewElectronReactApp",
  "directories": {
    "output": "release",
    "buildResources": "assets"
  },
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "files": [
    "dist-electron/**/*",
    "dist/**/*"
  ],
  "extraResources": [
    { "from": "python", "to": "python" },
    { "from": ".venv", "to": ".venv" }
  ],
  "win": {
    "icon": "assets/icon.ico"
  }
}
```

`build.bat`:
```bat
@echo off
setlocal

echo ==========================================
echo  Build Start
echo ==========================================

if exist release (
  echo Cleaning existing release directory...
  rmdir /s /q release
)

echo.
echo === Step 1: Build React (renderer) ===
call npm run build:react
IF ERRORLEVEL 1 GOTO fail
IF NOT EXIST dist\index.html (
  echo [FAIL] Frontend bundle NOT found: dist\index.html
  GOTO fail
)

echo.
echo === Step 2: Build Electron (main & preload) ===
call npm run build:electron
IF ERRORLEVEL 1 GOTO fail
IF NOT EXIST dist-electron\electron\main.js (
  echo [FAIL] Compiled main process entry NOT found: dist-electron\electron\main.js
  GOTO fail
)

echo.
echo === Step 3: Package with electron-builder ===
call npx electron-builder --win --config electron-builder.json
IF ERRORLEVEL 1 GOTO fail

echo.
echo ==========================================
echo  SUCCESS: Installer created in .\release
echo ==========================================
GOTO end

:fail
echo Build process aborted.
exit /b 1

:end
exit /b 0
```
12. Run and verify.
```powershell
npm run dev
```
Expected behavior:
- The app opens with a Projects Overview page.
- You can set a projects root and create/open projects.
- Inside a project, the Drop Image tile accepts drag/drop, paste, and browse.
- The Python service responds to `ping`.

13. Build an `.exe`.
```powershell
.\build.bat
```

**Notes**
This setup intentionally excludes a settings/preferences menu (per request). The project system matches the current app's pattern: projects live under a root folder, each project has a `project.json`, and the overview scans directories for existing projects.

