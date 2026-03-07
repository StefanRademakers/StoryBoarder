export type ShotDisplayMode = "concept" | "reference" | "still" | "clip" | "performance";
export type CandidateTab = "stills" | "clips";
export type PlaybackMediaKind = "video" | "image" | "placeholder";

export interface ShotModeAsset {
  name: string;
  path: string;
  relative: string;
  mtimeMs: number;
  isFavorite: boolean;
}

export interface ScenePoolAsset {
  name: string;
  path: string;
  source: string;
  mtimeMs: number;
}

export interface CandidateAsset {
  name: string;
  path: string;
  mtimeMs: number;
}

export interface InlineFullscreenAsset {
  path: string;
  name: string;
  isVideo: boolean;
}

export interface PlaybackMedia {
  kind: PlaybackMediaKind;
  path: string;
  sourceMode: ShotDisplayMode | null;
}
