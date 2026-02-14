import { contextBridge, ipcRenderer } from "electron";
import type { IElectronAPI, PickDirOptions, PickFileOptions, PickSaveFileOptions } from "../shared/preload";
import type { PythonResponse } from "../shared/ipc";

const api: IElectronAPI & { saveClipboardImage: (buffer: ArrayBuffer) => Promise<string | null> } = {
  readText: (path) => ipcRenderer.invoke("fs:read-text", { path }),
  writeText: (path, text) => ipcRenderer.invoke("fs:write-text", { path, text }),
  writeBinary: (path, data) => ipcRenderer.invoke("fs:write-binary", { path, data }),
  ensureDir: (path) => ipcRenderer.invoke("fs:ensure-dir", { path }),
  exists: (path) => ipcRenderer.invoke("fs:exists", { path }),
  listDir: (path) => ipcRenderer.invoke("fs:list-dir", { path }),
  stat: (path) => ipcRenderer.invoke("fs:stat", { path }),
  rename: (oldPath, newPath) => ipcRenderer.invoke("fs:rename", { oldPath, newPath }),
  openInExplorer: (path) => ipcRenderer.invoke("fs:open-in-explorer", { path }) as Promise<boolean>,
  revealInFileManager: (path) => ipcRenderer.invoke("fs:reveal-in-file-manager", { path }) as Promise<boolean>,
  openWithApp: (appPath, targetPath) => ipcRenderer.invoke("fs:open-with-app", { appPath, targetPath }) as Promise<boolean>,
  copyImageToClipboard: (path) => ipcRenderer.invoke("fs:copy-image-to-clipboard", { path }) as Promise<boolean>,
  copyFile: (from, to) => ipcRenderer.invoke("fs:copy-file", { from, to }),
  copyDir: (from, to) => ipcRenderer.invoke("fs:copy-dir", { from, to }),
  deleteFile: (path) => ipcRenderer.invoke("fs:delete-file", { path }),
  deleteDir: (path) => ipcRenderer.invoke("fs:delete-dir", { path }),
  pickFile: (options?: PickFileOptions) => ipcRenderer.invoke("dialog:pick-file", options ?? {}),
  pickDir: (options?: PickDirOptions) => ipcRenderer.invoke("dialog:pick-dir", options ?? {}),
  pickSaveFile: (options?: PickSaveFileOptions) => ipcRenderer.invoke("dialog:save-file", options ?? {}),
  getPath: (kind) => ipcRenderer.invoke("fs:get-path", { kind }),
  normalizePaths: (items) => ipcRenderer.invoke("fs:normalize-paths", { items }),
  runPythonCommand: (cmd, args, options) => ipcRenderer.invoke("python:command", { cmd, args, timeoutMs: options?.timeoutMs }) as Promise<PythonResponse>,
  ping: async () => {
    const response = (await ipcRenderer.invoke("python:command", { cmd: "ping" })) as PythonResponse;
    return response.ok === true;
  },
  saveClipboardImage: (buffer: ArrayBuffer) => ipcRenderer.invoke("clipboard:save-image", buffer),
  setWindowTitle: (title: string) => ipcRenderer.invoke("window:set-title", { title }) as Promise<boolean>,
  openEditorPopout: (payload) => ipcRenderer.invoke("window:open-editor-popout", payload) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("electronAPI", api);
