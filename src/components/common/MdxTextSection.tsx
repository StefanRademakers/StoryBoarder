import { useCallback, useEffect, useRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  UndoRedo,
  CreateLink,
} from "@mdxeditor/editor";
import { debounce } from "../../utils/debounce";
import { electron } from "../../services/electron";
import { getDirectoryName, isAbsolutePath, joinPath, toFileUrl } from "../../utils/path";

interface MdxTextSectionProps {
  value: string;
  onChange: (markdown: string) => void;
  projectRoot: string;
  fileName: string;
  targetPath?: string;
  placeholder?: string;
  debounceMs?: number;
  wrapInPanel?: boolean;
  className?: string;
}

export function MdxTextSection({
  value,
  onChange,
  projectRoot,
  fileName,
  targetPath,
  placeholder,
  debounceMs = 300,
  wrapInPanel = true,
  className,
}: MdxTextSectionProps) {
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const lastValueRef = useRef(value ?? "");
  const lastPersistedMarkdownRef = useRef(normalizeMarkdownForLoad(value ?? ""));

  const persistToDisk = useCallback(async (markdown: string) => {
    if (targetPath) {
      await electron.writeText(targetPath, markdown);
      return;
    }
    const scriptDir = joinPath(projectRoot, "script");
    const scriptPath = joinPath(scriptDir, fileName);
    await electron.ensureDir(scriptDir);
    await electron.writeText(scriptPath, markdown);
  }, [projectRoot, fileName, targetPath]);

  const resolveMarkdownDir = useCallback((): string => {
    if (targetPath) {
      return getDirectoryName(targetPath);
    }
    return joinPath(projectRoot, "script");
  }, [projectRoot, targetPath]);

  const resolveMarkdownFilePath = useCallback((): string => {
    if (targetPath) {
      return targetPath;
    }
    return joinPath(joinPath(projectRoot, "script"), fileName);
  }, [projectRoot, fileName, targetPath]);

  const cleanupRemovedLocalImages = useCallback(async (previousMarkdown: string, nextMarkdown: string) => {
    const previousSources = new Set(extractImageSources(previousMarkdown).map(normalizeImageSource));
    const nextSources = new Set(extractImageSources(nextMarkdown).map(normalizeImageSource));
    const removed = Array.from(previousSources).filter((source) => !nextSources.has(source));
    if (!removed.length) return;

    const markdownDir = resolveMarkdownDir();
    const currentMarkdownFile = resolveMarkdownFilePath();
    for (const source of removed) {
      if (!isManagedLocalImageSource(source)) continue;
      const stillReferenced = await isReferencedInSiblingMarkdowns(source, markdownDir, currentMarkdownFile);
      if (stillReferenced) continue;
      const absolutePath = joinPath(markdownDir, source);
      const exists = await electron.exists(absolutePath);
      if (exists) {
        await electron.deleteFile(absolutePath);
      }
    }
  }, [resolveMarkdownDir, resolveMarkdownFilePath]);

  const persistMarkdown = useCallback(async (markdown: string) => {
    await persistToDisk(markdown);
    try {
      await cleanupRemovedLocalImages(lastPersistedMarkdownRef.current, markdown);
      lastPersistedMarkdownRef.current = markdown;
    } catch (error) {
      console.warn("Failed to cleanup removed images", error);
    }
  }, [cleanupRemovedLocalImages, persistToDisk]);

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    const markdownDir = resolveMarkdownDir();
    const imagesDir = joinPath(markdownDir, "images");
    await electron.ensureDir(imagesDir);

    const ext = inferImageExtension(file);
    const base = sanitizeBaseName(file.name || `image-${Date.now()}`);
    let candidateName = `${base}${ext}`;
    let candidatePath = joinPath(imagesDir, candidateName);
    let counter = 1;
    while (await electron.exists(candidatePath)) {
      candidateName = `${base}-${counter}${ext}`;
      candidatePath = joinPath(imagesDir, candidateName);
      counter += 1;
    }

    const data = await file.arrayBuffer();
    await electron.writeBinary(candidatePath, data);
    return `images/${candidateName}`;
  }, [resolveMarkdownDir]);

  const resolveImagePreviewSource = useCallback(async (imageSource: string): Promise<string> => {
    const source = (imageSource ?? "").trim();
    if (!source) return source;
    const lower = source.toLowerCase();
    if (
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      lower.startsWith("data:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("file://")
    ) {
      return source;
    }

    const normalized = source.replace(/\\/g, "/");
    if (isAbsolutePath(normalized)) {
      return toFileUrl(normalized);
    }

    const markdownDir = resolveMarkdownDir();
    const relative = normalized.replace(/^\.?\//, "");
    return toFileUrl(joinPath(markdownDir, relative));
  }, [resolveMarkdownDir]);

  const debouncedPersistRef = useRef(
    debounce((markdown: string) => {
      void persistMarkdown(markdown);
    }, debounceMs)
  );

  useEffect(() => () => debouncedPersistRef.current.cancel(), []);

  useEffect(() => {
    const next = value ?? "";
    const loaded = normalizeMarkdownForLoad(next);
    if (loaded === lastValueRef.current) {
      return;
    }
    lastValueRef.current = loaded;
    lastPersistedMarkdownRef.current = loaded;
    editorRef.current?.setMarkdown(loaded);
  }, [value]);

  const handleChange = useCallback((markdown: string) => {
    const normalized = normalizeMarkdownForSave(markdown);
    lastValueRef.current = normalized;
    onChange(normalized);
    debouncedPersistRef.current(normalized);
  }, [onChange]);

  const handleBlurCapture = () => {
    const raw = editorRef.current?.getMarkdown() ?? lastValueRef.current;
    const markdown = normalizeMarkdownForSave(raw);
    debouncedPersistRef.current.cancel();
    onChange(markdown);
    void persistMarkdown(markdown);
  };

  const content = (
    <div className={className} onBlurCapture={handleBlurCapture}>
      <MDXEditor
        ref={editorRef}
        markdown={value ?? ""}
        onChange={handleChange}
        className="script-editor__mdx"
        contentEditableClassName="script-editor__rich"
        placeholder={placeholder ?? "Paste or type your script here..."}
        spellCheck={false}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin({ disableAutoLink: false }),
          linkDialogPlugin(),
          imagePlugin({
            imageUploadHandler: handleImageUpload,
            imagePreviewHandler: resolveImagePreviewSource,
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
              </>
            ),
          }),
        ]}
      />
    </div>
  );

  if (!wrapInPanel) {
    return content;
  }

  return (
    <section className="panel script-panel">
      {content}
    </section>
  );
}

function extractImageSources(markdown: string): string[] {
  const sources: string[] = [];
  const mdRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRegex.exec(markdown)) !== null) {
    sources.push(mdMatch[1] ?? "");
  }

  const htmlRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlRegex.exec(markdown)) !== null) {
    sources.push(htmlMatch[1] ?? "");
  }
  return sources;
}

function normalizeImageSource(source: string): string {
  return source.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function isManagedLocalImageSource(source: string): boolean {
  const lower = source.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("file://")
  ) {
    return false;
  }
  if (isAbsolutePath(source)) {
    return false;
  }
  return lower.startsWith("images/");
}

async function isReferencedInSiblingMarkdowns(
  source: string,
  markdownDir: string,
  currentMarkdownFile: string,
): Promise<boolean> {
  const currentFileNormalized = currentMarkdownFile.replace(/\\/g, "/").toLowerCase();
  const entries = await electron.listDir(markdownDir);
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.toLowerCase().endsWith(".md")) continue;
    const mdPath = joinPath(markdownDir, entry.name);
    if (mdPath.replace(/\\/g, "/").toLowerCase() === currentFileNormalized) {
      continue;
    }
    try {
      const text = await electron.readText(mdPath);
      const refs = new Set(extractImageSources(text).map(normalizeImageSource));
      if (refs.has(source)) {
        return true;
      }
    } catch {
      // ignore unreadable sibling markdown files
    }
  }
  return false;
}

function inferImageExtension(file: File): string {
  const name = file.name || "";
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx !== -1 && dotIdx < name.length - 1) {
    return name.slice(dotIdx);
  }
  const type = (file.type || "").toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return ".png";
}

function sanitizeBaseName(value: string): string {
  const dotIdx = value.lastIndexOf(".");
  const raw = dotIdx > 0 ? value.slice(0, dotIdx) : value;
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "").trim();
  return cleaned || `image-${Date.now()}`;
}

function normalizeMarkdownForSave(markdown: string): string {
  // Preserve intentional blank lines by inserting invisible HTML comments.
  return markdown.replace(/\n\s*\n/g, "\n\n<!-- -->\n\n");
}

function normalizeMarkdownForLoad(markdown: string): string {
  return markdown.replace(/\n\s*<!--\s*-->\s*\n/g, "\n\n");
}
