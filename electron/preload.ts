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
  setWindowTitle: (title: string) => ipcRenderer.invoke("window:set-title", { title }) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("electronAPI", api);
