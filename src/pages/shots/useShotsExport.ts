import { useCallback, useState } from "react";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";
import type { ShotDisplayMode } from "./types";
import { parsePositiveInteger, toErrorMessage } from "./utils";

interface ActiveSceneLike {
  id: string;
  name: string;
}

interface UseShotsExportParams<TShot> {
  activeScene: ActiveSceneLike | null;
  shots: TShot[];
  displayMode: ShotDisplayMode;
  scenesRoot: string;
  projectWidth: number;
  projectHeight: number;
  resolveShotAssetPath: (shot: TShot, mode: "concept" | "reference" | "still") => string;
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
}

export function useShotsExport<TShot>({
  activeScene,
  shots,
  displayMode,
  scenesRoot,
  projectWidth,
  projectHeight,
  resolveShotAssetPath,
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
  };
}
