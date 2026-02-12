let electron = require("electron");
if (!electron.app || typeof electron.app.whenReady !== "function") {
  delete process.env.ELECTRON_RUN_AS_NODE;
  electron = require("electron");
}
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Menu, globalShortcut } = electron as typeof import("electron");

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
ipcMain.handle("fs:copy-file", async (_event, { from, to }: { from: string; to: string }) => {
  const dir = path.dirname(to);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.copyFile(from, to);
});

ipcMain.handle("fs:delete-file", async (_event, { path: filePath }: { path: string }) => {
  await fsPromises.unlink(filePath);
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
