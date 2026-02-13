let electron = require("electron");
if (!electron.app || typeof electron.app.whenReady !== "function") {
  delete process.env.ELECTRON_RUN_AS_NODE;
  electron = require("electron");
}
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Menu, globalShortcut, shell, clipboard, nativeImage } = electron as typeof import("electron");

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { PythonResponse } from "../shared/ipc";
import type { AppPathKind, PickDirOptions, PickFileOptions } from "../shared/preload";
import { PythonService } from "./pythonService";

const fsPromises = fs.promises;
const pythonService = new PythonService();
const editorPopouts = new Map<string, InstanceType<typeof BrowserWindow>>();

function popoutKey(payload: { projectFilePath: string; targetPath: string }): string {
  return `${payload.projectFilePath}::${payload.targetPath}`;
}

function attachExternalNavigationPolicy(window: InstanceType<typeof BrowserWindow>): void {
  // Keep app navigation internal and open external links in the default browser.
  window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  window.webContents.on("will-navigate", (event: { preventDefault: () => void }, url: string) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

async function createWindow(): Promise<void> {
  nativeTheme.themeSource = "dark";
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 830,
    backgroundColor: "#1e1e1e",
    titleBarStyle: "default",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  attachExternalNavigationPolicy(mainWindow);

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

async function openEditorPopout(payload: { projectFilePath: string; targetPath: string; title: string }): Promise<boolean> {
  const key = popoutKey(payload);
  const existing = editorPopouts.get(key);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.focus();
    return true;
  }

  const popoutWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    backgroundColor: "#1e1e1e",
    titleBarStyle: "default",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  attachExternalNavigationPolicy(popoutWindow);
  editorPopouts.set(key, popoutWindow);
  popoutWindow.on("closed", () => {
    const current = editorPopouts.get(key);
    if (current === popoutWindow) {
      editorPopouts.delete(key);
    }
  });

  const params = new URLSearchParams({
    popout: "editor",
    projectFilePath: payload.projectFilePath,
    targetPath: payload.targetPath,
    title: payload.title,
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    url.search = params.toString();
    void popoutWindow.loadURL(url.toString());
    return true;
  }

  const indexHtml = path.join(getBasePath(), "dist", "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`Frontend bundle not found at ${indexHtml}. Run 'npm run build:react' first.`);
  }
  void popoutWindow.loadFile(indexHtml, {
    query: {
      popout: "editor",
      projectFilePath: payload.projectFilePath,
      targetPath: payload.targetPath,
      title: payload.title,
    },
  });
  return true;
}

function getBasePath(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "..", "..");
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.toggleDevTools();
    }
  });

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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
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
ipcMain.handle("fs:write-binary", async (_event, { path: filePath, data }: { path: string; data: ArrayBuffer }) => {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, Buffer.from(data));
});

function isRetryableCopyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "EBUSY" || code === "EPERM";
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyFileWithRetry(from: string, to: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fsPromises.copyFile(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableCopyError(error) || attempt === 5) {
        break;
      }
      await delay(40 * (attempt + 1));
    }
  }
  throw lastError;
}

ipcMain.handle("fs:copy-file", async (_event, { from, to }: { from: string; to: string }) => {
  const dir = path.dirname(to);
  await fsPromises.mkdir(dir, { recursive: true });
  await copyFileWithRetry(from, to);
});
ipcMain.handle("fs:copy-dir", async (_event, { from, to }: { from: string; to: string }) => {
  await fsPromises.mkdir(path.dirname(to), { recursive: true });
  await fsPromises.cp(from, to, { recursive: true });
});

ipcMain.handle("fs:delete-file", async (_event, { path: filePath }: { path: string }) => {
  await fsPromises.unlink(filePath);
});
ipcMain.handle("fs:delete-dir", async (_event, { path: dirPath }: { path: string }) => {
  await fsPromises.rm(dirPath, { recursive: true, force: true });
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

ipcMain.handle("fs:rename", async (_event, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
  await fsPromises.rename(oldPath, newPath);
});
ipcMain.handle("fs:open-in-explorer", async (_event, { path: targetPath }: { path: string }) => {
  const normalizedPath = path.normalize(targetPath);
  const result = await shell.openPath(normalizedPath);
  return result === "";
});
ipcMain.handle("fs:reveal-in-file-manager", async (_event, { path: targetPath }: { path: string }) => {
  try {
    const normalizedPath = path.normalize(targetPath);
    shell.showItemInFolder(normalizedPath);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("fs:open-with-app", async (_event, { appPath, targetPath }: { appPath: string; targetPath: string }) => {
  try {
    const normalizedAppPath = path.normalize(appPath);
    const normalizedTargetPath = path.normalize(targetPath);
    if (process.platform === "darwin" && normalizedAppPath.toLowerCase().endsWith(".app")) {
      const child = spawn("open", ["-a", normalizedAppPath, normalizedTargetPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    }
    const child = spawn(normalizedAppPath, [normalizedTargetPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("fs:copy-image-to-clipboard", async (_event, { path: targetPath }: { path: string }) => {
  try {
    const image = nativeImage.createFromPath(path.normalize(targetPath));
    if (image.isEmpty()) {
      return false;
    }
    clipboard.writeImage(image);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:get-path", async (_event, { kind }: { kind: AppPathKind }) => {
  return app.getPath(kind);
});

ipcMain.handle("fs:normalize-paths", async (_event, { items }: { items: string[] }) => {
  const normalized = Array.from(new Set(items.map((item) => normalizePath(item)).filter(Boolean)));
  return normalized;
});

ipcMain.handle("window:set-title", async (_event, { title }: { title: string }) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    const next = typeof title === "string" && title.trim().length ? title : "StoryBuilder";
    win.setTitle(next);
  }
  return true;
});
ipcMain.handle(
  "window:open-editor-popout",
  async (_event, payload: { projectFilePath: string; targetPath: string; title: string }) => {
    return openEditorPopout(payload);
  },
);

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
  if (/^(?:https?|data|blob):/i.test(trimmed)) {
    // Ignore web/data URLs for local file operations.
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

function isExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
