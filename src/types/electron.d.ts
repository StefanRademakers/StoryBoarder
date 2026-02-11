import type { IElectronAPI } from "../../shared/preload";

declare global {
  interface Window {
    electronAPI: IElectronAPI & {
      saveClipboardImage: (buffer: ArrayBuffer) => Promise<string | null>;
    };
  }
}

export {};
