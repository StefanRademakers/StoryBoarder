import { useCallback, useState } from "react";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";
import type { ShotDisplayMode } from "./types";
import { parsePositiveInteger, sanitizeFileName, toErrorMessage } from "./utils";

interface ActiveSceneLike {
  id: string;
  name: string;
}

interface UseShotsExportParams<TShot> {
  activeScene: ActiveSceneLike | null;
  shots: TShot[];
  displayMode: ShotDisplayMode;
  scenesRoot: string;
  projectFrameRate: number;
  projectWidth: number;
  projectHeight: number;
  resolveShotAssetPath: (shot: TShot, mode: "concept" | "reference" | "still") => string;
  resolveFcp7Media: (shot: TShot) => { path: string; mediaType: "video" | "image"; durationSeconds?: number | null } | null;
}

interface UseShotsExportResult {
  exportDialogOpen: boolean;
  exportColumnsText: string;
  exportStartIndexText: string;
  exportEndIndexText: string;
  exportResizeEnabled: boolean;
  exportMaxLongestEdgeText: string;
  gridExportBusy: boolean;
  gridExportMessage: string | null;
  setExportColumnsText: (value: string) => void;
  setExportStartIndexText: (value: string) => void;
  setExportEndIndexText: (value: string) => void;
  setExportResizeEnabled: (value: boolean) => void;
  setExportMaxLongestEdgeText: (value: string) => void;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  exportSceneGrid: () => Promise<void>;
  exportSceneFcp7: () => Promise<void>;
}

export function useShotsExport<TShot>({
  activeScene,
  shots,
  displayMode,
  scenesRoot,
  projectFrameRate,
  projectWidth,
  projectHeight,
  resolveShotAssetPath,
  resolveFcp7Media,
}: UseShotsExportParams<TShot>): UseShotsExportResult {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportColumnsText, setExportColumnsText] = useState("2");
  const [exportStartIndexText, setExportStartIndexText] = useState("1");
  const [exportEndIndexText, setExportEndIndexText] = useState("1");
  const [exportResizeEnabled, setExportResizeEnabled] = useState(false);
  const [exportMaxLongestEdgeText, setExportMaxLongestEdgeText] = useState("2024");
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

  const exportSceneGrid = useCallback(async () => {
    if (!activeScene || !shots.length || gridExportBusy) return;
    if (displayMode === "clip") {
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
    const defaultName = `${modeName}_${activeScene.name.replace(/[\\/:*?"<>|]+/g, "_")}.png`;
    const pickedFile = await electron.pickSaveFile({
      title: "Save grid export",
      defaultPath: joinPath(joinPath(scenesRoot, activeScene.id), defaultName),
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!pickedFile) return;
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
      const expectedOutputPath = pickedFile.toLowerCase().endsWith(".png") ? pickedFile : `${pickedFile}.png`;
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
            outputPath: pickedFile,
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
      await electron.revealInFileManager(expectedOutputPath);
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
  }, [activeScene, gridExportBusy, projectFrameRate, resolveFcp7Media, scenesRoot, shots]);

  return {
    exportDialogOpen,
    exportColumnsText,
    exportStartIndexText,
    exportEndIndexText,
    exportResizeEnabled,
    exportMaxLongestEdgeText,
    gridExportBusy,
    gridExportMessage,
    setExportColumnsText,
    setExportStartIndexText,
    setExportEndIndexText,
    setExportResizeEnabled,
    setExportMaxLongestEdgeText,
    openExportDialog,
    closeExportDialog,
    exportSceneGrid,
    exportSceneFcp7,
  };
}
