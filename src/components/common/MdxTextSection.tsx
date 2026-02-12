import { useCallback, useEffect, useRef } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  UndoRedo,
} from "@mdxeditor/editor";
import { debounce } from "../../utils/debounce";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";

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
  const internalChangeRef = useRef(false);

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

  const debouncedPersistRef = useRef(
    debounce((markdown: string) => {
      void persistToDisk(markdown);
    }, debounceMs)
  );

  useEffect(() => () => debouncedPersistRef.current.cancel(), []);

  useEffect(() => {
    const next = value ?? "";
    const loaded = normalizeMarkdownForLoad(next);
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    if (loaded === lastValueRef.current) {
      return;
    }
    lastValueRef.current = loaded;
    editorRef.current?.setMarkdown(loaded);
  }, [value]);

  const handleChange = useCallback((markdown: string) => {
    const normalized = normalizeMarkdownForSave(markdown);
    lastValueRef.current = normalized;
    internalChangeRef.current = true;
    onChange(normalized);
    debouncedPersistRef.current(normalized);
  }, [onChange]);

  const handleBlurCapture = () => {
    const raw = editorRef.current?.getMarkdown() ?? lastValueRef.current;
    const markdown = normalizeMarkdownForSave(raw);
    debouncedPersistRef.current.cancel();
    onChange(markdown);
    void persistToDisk(markdown);
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
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
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

function normalizeMarkdownForSave(markdown: string): string {
  // Preserve intentional blank lines by inserting invisible HTML comments.
  return markdown.replace(/\n\s*\n/g, "\n\n<!-- -->\n\n");
}

function normalizeMarkdownForLoad(markdown: string): string {
  return markdown.replace(/\n\s*<!--\s*-->\s*\n/g, "\n\n");
}
