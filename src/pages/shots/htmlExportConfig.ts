import type { ShotDisplayMode } from "./types";

export type HtmlExportImageFormat = "jpg80" | "png";
export type HtmlExportSceneScope = "current" | "all";

export interface HtmlExportModeDefinition {
  value: ShotDisplayMode;
  label: string;
  iconPath: string;
}

export const HTML_EXPORT_SCHEMA_VERSION = 1;

export const HTML_EXPORT_MODE_DEFINITIONS: HtmlExportModeDefinition[] = [
  { value: "concept", label: "Concept", iconPath: "icons/concept.png" },
  { value: "still", label: "Still", iconPath: "icons/still.png" },
  { value: "clip", label: "Clip", iconPath: "icons/clip.png" },
  { value: "performance", label: "Performance", iconPath: "icons/clip.png" },
  { value: "reference", label: "Reference", iconPath: "icons/still.png" },
];

export const HTML_EXPORT_ALLOWED_MODES: ShotDisplayMode[] = HTML_EXPORT_MODE_DEFINITIONS.map((item) => item.value);
export const HTML_EXPORT_DEFAULT_MODES: ShotDisplayMode[] = [...HTML_EXPORT_ALLOWED_MODES];

export const HTML_EXPORT_FORMAT_OPTIONS: Array<{ value: HtmlExportImageFormat; label: string }> = [
  { value: "jpg80", label: "JPG 80%" },
  { value: "png", label: "PNG" },
];

export const HTML_EXPORT_SCENE_SCOPE_OPTIONS: Array<{ value: HtmlExportSceneScope; label: string }> = [
  { value: "current", label: "Current Scene" },
  { value: "all", label: "All Scenes" },
];
