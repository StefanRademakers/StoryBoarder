export type ShotDisplayMode = "concept" | "reference" | "still" | "clip";

export interface ShotModeAsset {
  name: string;
  path: string;
  relative: string;
  mtimeMs: number;
  isFavorite: boolean;
}
