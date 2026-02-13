import type { DragEvent } from "react";

export async function extractPathsFromDrop(event: DragEvent<HTMLElement>): Promise<string[]> {
  event.preventDefault();
  event.stopPropagation();

  const items = new Set<string>();
  const { dataTransfer } = event;
  if (!dataTransfer) return [];

  if (dataTransfer.files?.length) {
    Array.from(dataTransfer.files).forEach((file) => {
      const withPath = file as File & { path?: string };
      if (withPath.path) {
        items.add(withPath.path);
      }
    });
  }

  const plain = dataTransfer.getData("text/plain");
  if (plain) items.add(plain.trim());

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => items.add(line));
  }

  if (items.size === 0) return [];
  const localCandidates = filterLocalCandidates(Array.from(items));
  if (!localCandidates.length) return [];

  try {
    return await window.electronAPI.normalizePaths(localCandidates);
  } catch (error) {
    console.error("Failed to normalize dropped paths", error);
    return localCandidates;
  }
}

export function handleDragOver(event: DragEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function filterLocalCandidates(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(?:https?|data|blob):/i.test(item));
}
