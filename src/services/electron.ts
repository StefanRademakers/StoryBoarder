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
  writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    return getElectron().writeBinary(path, data);
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
  rename(oldPath: string, newPath: string): Promise<void> {
    return getElectron().rename(oldPath, newPath);
  },
  openInExplorer(path: string): Promise<boolean> {
    return getElectron().openInExplorer(path);
  },
  revealInFileManager(path: string): Promise<boolean> {
    return getElectron().revealInFileManager(path);
  },
  openWithApp(appPath: string, targetPath: string): Promise<boolean> {
    return getElectron().openWithApp(appPath, targetPath);
  },
  copyImageToClipboard(path: string): Promise<boolean> {
    return getElectron().copyImageToClipboard(path);
  },
  copyFile(from: string, to: string): Promise<void> {
    return getElectron().copyFile(from, to);
  },
  copyDir(from: string, to: string): Promise<void> {
    return getElectron().copyDir(from, to);
  },
  deleteFile(path: string): Promise<void> {
    return getElectron().deleteFile(path);
  },
  deleteDir(path: string): Promise<void> {
    return getElectron().deleteDir(path);
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
  setWindowTitle(title: string): Promise<boolean> {
    return getElectron().setWindowTitle(title);
  },
  openEditorPopout(payload: { projectFilePath: string; targetPath: string; title: string }): Promise<boolean> {
    return getElectron().openEditorPopout(payload);
  },
} as const;

export type Electron = typeof electron;
