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
  setWindowTitle(title: string): Promise<boolean>;
}
