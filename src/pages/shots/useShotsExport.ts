import { useCallback, useState } from "react";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";
import type { HtmlExportImageFormat, HtmlExportSceneScope } from "./HtmlExportDialog";
import type { ShotDisplayMode } from "./types";
import { parsePositiveInteger, sanitizeFileName, toErrorMessage } from "./utils";

interface ActiveSceneLike {
  id: string;
  name: string;
}

interface UseShotsExportParams<TShot> {
  activeScene: ActiveSceneLike | null;
  exportScenes: ActiveSceneLike[];
  loadShotsForScene: (sceneId: string) => Promise<TShot[]>;
  shots: TShot[];
  displayMode: ShotDisplayMode;
  projectRoot: string;
  scenesRoot: string;
  projectFrameRate: number;
  projectWidth: number;
  projectHeight: number;
  resolveShotAssetPath: (shot: TShot, mode: ShotDisplayMode) => string;
  resolveShotAssetPathForScene: (sceneId: string, shot: TShot, mode: ShotDisplayMode) => string;
  resolveFcp7Media: (shot: TShot) => { path: string; mediaType: "video" | "image"; durationSeconds?: number | null } | null;
  resolveFavoriteClipPath: (shot: TShot) => string;
  resolveShotDescription?: (shot: TShot) => string | null | undefined;
  resolveShotDetails?: (shot: TShot) => Record<string, string | number | null | undefined>;
}

interface UseShotsExportResult {
  exportDialogOpen: boolean;
  exportColumnsText: string;
  exportStartIndexText: string;
  exportEndIndexText: string;
  exportResizeEnabled: boolean;
  exportMaxLongestEdgeText: string;
  htmlExportDialogOpen: boolean;
  htmlExportStartIndexText: string;
  htmlExportEndIndexText: string;
  htmlExportModes: ShotDisplayMode[];
  htmlExportImageFormat: HtmlExportImageFormat;
  htmlExportSceneScope: HtmlExportSceneScope;
  gridExportBusy: boolean;
  gridExportMessage: string | null;
  setExportColumnsText: (value: string) => void;
  setExportStartIndexText: (value: string) => void;
  setExportEndIndexText: (value: string) => void;
  setExportResizeEnabled: (value: boolean) => void;
  setExportMaxLongestEdgeText: (value: string) => void;
  setHtmlExportStartIndexText: (value: string) => void;
  setHtmlExportEndIndexText: (value: string) => void;
  setHtmlExportModes: (value: ShotDisplayMode[]) => void;
  setHtmlExportImageFormat: (value: HtmlExportImageFormat) => void;
  setHtmlExportSceneScope: (value: HtmlExportSceneScope) => void;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  openHtmlExportDialog: () => void;
  closeHtmlExportDialog: () => void;
  exportSceneGrid: () => Promise<void>;
  exportSceneFcp7: () => Promise<void>;
  exportSceneClips: () => Promise<void>;
  exportSceneHtml: () => Promise<void>;
}

const HTML_EXPORT_DEFAULT_MODES: ShotDisplayMode[] = ["concept", "still", "clip", "performance", "reference"];

function fileExtension(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const queryIndex = normalized.indexOf("?");
  const cleaned = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  const slashIndex = cleaned.lastIndexOf("/");
  const fileName = slashIndex >= 0 ? cleaned.slice(slashIndex + 1) : cleaned;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

export function useShotsExport<TShot>({
  activeScene,
  exportScenes,
  loadShotsForScene,
  shots,
  displayMode,
  projectRoot,
  scenesRoot,
  projectFrameRate,
  projectWidth,
  projectHeight,
  resolveShotAssetPath,
  resolveShotAssetPathForScene,
  resolveFcp7Media,
  resolveFavoriteClipPath,
  resolveShotDescription,
  resolveShotDetails,
}: UseShotsExportParams<TShot>): UseShotsExportResult {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportColumnsText, setExportColumnsText] = useState("2");
  const [exportStartIndexText, setExportStartIndexText] = useState("1");
  const [exportEndIndexText, setExportEndIndexText] = useState("1");
  const [exportResizeEnabled, setExportResizeEnabled] = useState(false);
  const [exportMaxLongestEdgeText, setExportMaxLongestEdgeText] = useState("2024");
  const [htmlExportDialogOpen, setHtmlExportDialogOpen] = useState(false);
  const [htmlExportStartIndexText, setHtmlExportStartIndexText] = useState("1");
  const [htmlExportEndIndexText, setHtmlExportEndIndexText] = useState("1");
  const [htmlExportModes, setHtmlExportModes] = useState<ShotDisplayMode[]>([...HTML_EXPORT_DEFAULT_MODES]);
  const [htmlExportImageFormat, setHtmlExportImageFormat] = useState<HtmlExportImageFormat>("jpg80");
  const [htmlExportSceneScope, setHtmlExportSceneScope] = useState<HtmlExportSceneScope>("current");
  const [gridExportBusy, setGridExportBusy] = useState(false);
  const [gridExportMessage, setGridExportMessage] = useState<string | null>(null);

  const closeExportDialog = useCallback(() => {
    setExportDialogOpen(false);
  }, []);

  const openExportDialog = useCallback(() => {
    const totalShots = shots.length || 1;
    setExportColumnsText("2");
    setExportStartIndexText("1");
    setExportEndIndexText(String(totalShots));
    setExportResizeEnabled(false);
    setExportMaxLongestEdgeText("2024");
    setExportDialogOpen(true);
  }, [shots.length]);

  const closeHtmlExportDialog = useCallback(() => {
    setHtmlExportDialogOpen(false);
  }, []);

  const openHtmlExportDialog = useCallback(() => {
    const totalShots = shots.length || 1;
    setHtmlExportStartIndexText("1");
    setHtmlExportEndIndexText(String(totalShots));
    setHtmlExportModes([...HTML_EXPORT_DEFAULT_MODES]);
    setHtmlExportImageFormat("jpg80");
    setHtmlExportSceneScope("current");
    setHtmlExportDialogOpen(true);
  }, [shots.length]);

  const exportSceneGrid = useCallback(async () => {
    if (!activeScene || !shots.length || gridExportBusy) return;
    if (displayMode === "clip" || displayMode === "performance") {
      setGridExportMessage("Export is only available in Concept, Reference, or Still mode.");
      return;
    }
    const mode: "concept" | "reference" | "still" = displayMode;

    const columnsRaw = parsePositiveInteger(exportColumnsText);
    const columns = Math.max(1, Math.min(24, columnsRaw ?? 2));
    const totalShots = shots.length;
    const startRaw = parsePositiveInteger(exportStartIndexText);
    const endRaw = parsePositiveInteger(exportEndIndexText);
    const startIndex = Math.max(1, Math.min(totalShots, startRaw ?? 1));
    const endIndex = Math.max(startIndex, Math.min(totalShots, endRaw ?? totalShots));
    const exportShots = shots.slice(startIndex - 1, endIndex);
    if (!exportShots.length) {
      setGridExportMessage("No shots in selected range.");
      return;
    }
    const maxLongestEdge = parsePositiveInteger(exportMaxLongestEdgeText) ?? 2024;
    const modeName = mode === "concept" ? "concept_board" : mode === "reference" ? "reference_board" : "still_board";
    const sceneDir = joinPath(scenesRoot, activeScene.id);
    const exportDir = joinPath(sceneDir, "export");
    const safeSceneName = sanitizeFileName(activeScene.name) || activeScene.id;
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
    const outputPath = joinPath(exportDir, `${modeName}_${safeSceneName}_${timestamp}.png`);
    const items = exportShots.map((shot, idx) => {
      const absolute = resolveShotAssetPath(shot, mode);
      const shotNumber = startIndex + idx;
      return {
        path: absolute,
        label: `SHOT ${String(shotNumber).padStart(3, "0")}`,
      };
    });

    setGridExportBusy(true);
    setGridExportMessage(null);
    try {
      await electron.ensureDir(exportDir);
      const response = await electron.runPythonCommand(
        "create_image_grid",
        {
          paths: [],
          data: {
            items,
            xTiles: columns,
            tileWidth: projectWidth,
            tileHeight: projectHeight,
            fitMode: "contain",
            padding: 24,
            addLabels: true,
            textColor: "#ffffff",
            backgroundColor: "#ffffff",
            resizeToMaxLongestEdge: exportResizeEnabled,
            maxLongestEdge,
            saveJpegCopy: true,
            jpegQuality: 80,
            outputPath,
          },
        },
        { timeoutMs: 120000 },
      );
      if (!response.ok) {
        setGridExportMessage(`Export failed: ${response.error.message}`);
        return;
      }
      const message = typeof response.data?.message === "string"
        ? response.data.message
        : "Grid export completed.";
      setGridExportMessage(message);
      const finalPath = typeof response.data?.outputPath === "string" ? response.data.outputPath : outputPath;
      await electron.revealInFileManager(finalPath);
      setExportDialogOpen(false);
    } catch (error) {
      setGridExportMessage(`Export failed: ${toErrorMessage(error)}`);
    } finally {
      setGridExportBusy(false);
    }
  }, [
    activeScene,
    displayMode,
    exportColumnsText,
    exportEndIndexText,
    exportMaxLongestEdgeText,
    exportResizeEnabled,
    exportStartIndexText,
    gridExportBusy,
    projectHeight,
    projectWidth,
    resolveShotAssetPath,
    scenesRoot,
    shots,
  ]);

  const exportSceneFcp7 = useCallback(async () => {
    if (!activeScene || !shots.length || gridExportBusy) return;

    const sceneDir = joinPath(scenesRoot, activeScene.id);
    const exportDir = joinPath(sceneDir, "export");
    const safeSceneName = sanitizeFileName(activeScene.name) || activeScene.id;
    const outputPath = joinPath(exportDir, `${safeSceneName}_shots_fcp7.xml`);

    const candidates = shots.map((shot, idx) => {
      const media = resolveFcp7Media(shot);
      if (!media?.path) return null;
      return {
        shotNumber: idx + 1,
        path: media.path,
        mediaType: media.mediaType,
        durationSeconds: media.durationSeconds ?? null,
      };
    });

    const items = [];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!(await electron.exists(candidate.path))) continue;
      items.push(candidate);
    }

    if (!items.length) {
      setGridExportMessage("FCP7 export failed: no valid clip/still/concept media found.");
      return;
    }

    setGridExportBusy(true);
    setGridExportMessage(null);
    try {
      const response = await electron.runPythonCommand(
        "export_fcp7_shots",
        {
          sceneName: activeScene.name,
          sceneDir,
          outputPath,
          fps: projectFrameRate,
          width: projectWidth,
          height: projectHeight,
          items,
        },
        { timeoutMs: 120000 },
      );
      if (!response.ok) {
        setGridExportMessage(`FCP7 export failed: ${response.error.message}`);
        return;
      }
      const finalPath = typeof response.data?.outputPath === "string" ? response.data.outputPath : outputPath;
      const exportedCount = typeof response.data?.count === "number" ? response.data.count : items.length;
      setGridExportMessage(`FCP7 export completed (${exportedCount} shots).`);
      await electron.revealInFileManager(finalPath);
    } catch (error) {
      setGridExportMessage(`FCP7 export failed: ${toErrorMessage(error)}`);
    } finally {
      setGridExportBusy(false);
    }
  }, [activeScene, gridExportBusy, projectFrameRate, projectHeight, projectWidth, resolveFcp7Media, scenesRoot, shots]);

  const exportSceneClips = useCallback(async () => {
    if (!activeScene || !shots.length || gridExportBusy) return;

    const sceneDir = joinPath(scenesRoot, activeScene.id);
    const renderDir = joinPath(sceneDir, "render");
    const copied: Array<{ from: string; to: string }> = [];

    for (let idx = 0; idx < shots.length; idx += 1) {
      const shot = shots[idx];
      const sourcePath = resolveFavoriteClipPath(shot);
      if (!sourcePath) continue;
      if (!(await electron.exists(sourcePath))) continue;
      const extension = fileExtension(sourcePath) || ".mp4";
      const targetName = `clip_${String(idx + 1).padStart(3, "0")}${extension}`;
      copied.push({
        from: sourcePath,
        to: joinPath(renderDir, targetName),
      });
    }

    if (!copied.length) {
      setGridExportMessage("Export Clips failed: no valid favorite clips found.");
      return;
    }

    setGridExportBusy(true);
    setGridExportMessage(null);
    try {
      await electron.ensureDir(renderDir);
      for (const item of copied) {
        await electron.copyFile(item.from, item.to);
      }
      setGridExportMessage(`Export Clips completed (${copied.length} clips).`);
      await electron.revealInFileManager(renderDir);
    } catch (error) {
      setGridExportMessage(`Export Clips failed: ${toErrorMessage(error)}`);
    } finally {
      setGridExportBusy(false);
    }
  }, [activeScene, gridExportBusy, resolveFavoriteClipPath, scenesRoot, shots]);

  const exportSceneHtml = useCallback(async () => {
    if (gridExportBusy) return;
    const selectedModes = htmlExportModes.filter((mode) => HTML_EXPORT_DEFAULT_MODES.includes(mode));
    if (!selectedModes.length) {
      setGridExportMessage("Html Export failed: select at least one mode.");
      return;
    }

    const startRaw = parsePositiveInteger(htmlExportStartIndexText);
    const endRaw = parsePositiveInteger(htmlExportEndIndexText);
    const buildScenePayload = (sceneId: string, sceneName: string, sceneShots: TShot[]) => {
      const totalShots = sceneShots.length;
      if (!totalShots) return null;
      const startIndex = Math.max(1, Math.min(totalShots, startRaw ?? 1));
      const endIndex = Math.max(startIndex, Math.min(totalShots, endRaw ?? totalShots));
      const exportShots = sceneShots.slice(startIndex - 1, endIndex);
      if (!exportShots.length) return null;
      return {
        sceneId,
        sceneName,
        shots: exportShots.map((shot, idx) => ({
          shotNumber: startIndex + idx,
          description: resolveShotDescription?.(shot)?.trim() ?? "",
          details: resolveShotDetails?.(shot) ?? {},
          mediaByMode: selectedModes.reduce<Record<string, string>>((acc, mode) => {
            acc[mode] = resolveShotAssetPathForScene(sceneId, shot, mode);
            return acc;
          }, {}),
        })),
      };
    };

    const payloadScenes: Array<{ sceneId: string; sceneName: string; shots: Array<Record<string, unknown>> }> = [];
    if (htmlExportSceneScope === "all") {
      for (const scene of exportScenes) {
        const sceneShots = scene.id === activeScene?.id ? shots : await loadShotsForScene(scene.id);
        const payload = buildScenePayload(scene.id, scene.name, sceneShots);
        if (payload) {
          payloadScenes.push(payload);
        }
      }
    } else {
      if (!activeScene) {
        setGridExportMessage("Html Export failed: no active scene.");
        return;
      }
      const payload = buildScenePayload(activeScene.id, activeScene.name, shots);
      if (payload) {
        payloadScenes.push(payload);
      }
    }

    if (!payloadScenes.length) {
      setGridExportMessage("Html Export failed: no shots in selected range.");
      return;
    }

    setGridExportBusy(true);
    setGridExportMessage(null);
    try {
      const response = await electron.runPythonCommand(
        "export_html_shots",
        {
          projectRoot,
          imageFormat: htmlExportImageFormat,
          selectedModes,
          scenes: payloadScenes,
        },
        { timeoutMs: 180000 },
      );
      if (!response.ok) {
        setGridExportMessage(`Html Export failed: ${response.error.message}`);
        return;
      }
      const outputDir = typeof response.data?.outputDir === "string"
        ? response.data.outputDir
        : joinPath(projectRoot, "exports");
      const exportedCount = typeof response.data?.count === "number"
        ? response.data.count
        : payloadScenes.reduce((sum, scene) => sum + scene.shots.length, 0);
      setGridExportMessage(`Html Export completed (${exportedCount} shots).`);
      await electron.revealInFileManager(outputDir);
      setHtmlExportDialogOpen(false);
    } catch (error) {
      setGridExportMessage(`Html Export failed: ${toErrorMessage(error)}`);
    } finally {
      setGridExportBusy(false);
    }
  }, [
    activeScene,
    gridExportBusy,
    htmlExportEndIndexText,
    htmlExportImageFormat,
    htmlExportModes,
    htmlExportSceneScope,
    htmlExportStartIndexText,
    exportScenes,
    loadShotsForScene,
    projectRoot,
    resolveShotAssetPathForScene,
    resolveShotDescription,
    resolveShotDetails,
    activeScene,
    shots,
  ]);

  return {
    exportDialogOpen,
    exportColumnsText,
    exportStartIndexText,
    exportEndIndexText,
    exportResizeEnabled,
    exportMaxLongestEdgeText,
    htmlExportDialogOpen,
    htmlExportStartIndexText,
    htmlExportEndIndexText,
    htmlExportModes,
    htmlExportImageFormat,
    htmlExportSceneScope,
    gridExportBusy,
    gridExportMessage,
    setExportColumnsText,
    setExportStartIndexText,
    setExportEndIndexText,
    setExportResizeEnabled,
    setExportMaxLongestEdgeText,
    setHtmlExportStartIndexText,
    setHtmlExportEndIndexText,
    setHtmlExportModes,
    setHtmlExportImageFormat,
    setHtmlExportSceneScope,
    openExportDialog,
    closeExportDialog,
    openHtmlExportDialog,
    closeHtmlExportDialog,
    exportSceneGrid,
    exportSceneFcp7,
    exportSceneClips,
    exportSceneHtml,
  };
}
