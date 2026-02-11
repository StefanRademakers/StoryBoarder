import { useCallback, useEffect, useRef } from "react";
import { debounce } from "../../utils/debounce";
import { electron } from "../../services/electron";
import { joinPath } from "../../utils/path";

interface RichTextSectionProps {
  value: string;
  onChange: (markdown: string) => void;
  projectRoot: string;
  fileName: string;
}

export function RichTextSection({ value, onChange, projectRoot, fileName }: RichTextSectionProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const lastSyncedMarkdownRef = useRef("");
  const htmlCacheRef = useRef("");
  const hasHydratedRef = useRef(false);

  const persistToDisk = useCallback(async (markdown: string) => {
    const scriptDir = joinPath(projectRoot, "script");
    const scriptPath = joinPath(scriptDir, fileName);
    await electron.ensureDir(scriptDir);
    await electron.writeText(scriptPath, markdown);
  }, [projectRoot, fileName]);

  const syncFromEditor = useCallback((fallbackHtml?: string) => {
    const editor = editorRef.current;
    const html = editor?.innerHTML ?? fallbackHtml ?? htmlCacheRef.current;
    if (!html) return;
    const markdown = htmlToMarkdown(html);
    if (markdown === lastSyncedMarkdownRef.current) return;
    lastSyncedMarkdownRef.current = markdown;
    onChange(markdown);
    void persistToDisk(markdown);
  }, [onChange, persistToDisk]);

  const debouncedSyncRef = useRef(debounce(() => {
    syncFromEditor();
  }, 250));

  useEffect(() => () => debouncedSyncRef.current.cancel(), []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (isFocusedRef.current) return;
    if (hasHydratedRef.current && value === lastSyncedMarkdownRef.current) return;
    const nextHtml = markdownToHtml(value ?? "");
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    htmlCacheRef.current = editor.innerHTML;
    lastSyncedMarkdownRef.current = value ?? "";
    hasHydratedRef.current = true;
  }, [value]);

  useEffect(() => {
    return () => {
      debouncedSyncRef.current.cancel();
      syncFromEditor(htmlCacheRef.current);
    };
  }, [syncFromEditor]);

  const applyCommand = (command: "bold" | "formatBlock" | "justifyLeft" | "justifyCenter" | "justifyRight") => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (command === "formatBlock") {
      document.execCommand(command, false, "h2");
    } else if (command === "paragraph") {
      document.execCommand("formatBlock", false, "p");
    } else {
      document.execCommand(command);
    }
    htmlCacheRef.current = editor.innerHTML;
    syncFromEditor();
  };

  return (
    <section className="panel script-panel">
      <div className="script-toolbar">
        <button type="button" className="pill-button" onClick={() => applyCommand("formatBlock")}>
          Header
        </button>
        <button type="button" className="pill-button" onClick={() => applyCommand("paragraph")}>
          Normal
        </button>
        <button type="button" className="pill-button" onClick={() => applyCommand("bold")}>
          Bold
        </button>
        <button type="button" className="pill-button" onClick={() => applyCommand("justifyLeft")}>
          Left
        </button>
        <button type="button" className="pill-button" onClick={() => applyCommand("justifyCenter")}>
          Center
        </button>
        <button type="button" className="pill-button" onClick={() => applyCommand("justifyRight")}>
          Right
        </button>
      </div>
      <div className="script-editor">
        <div
          ref={editorRef}
          className="script-editor__rich"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          spellCheck={false}
          data-placeholder="Paste or type your script here..."
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") ?? "";
            if (!text) return;
            const editor = editorRef.current;
            if (!editor) return;
            editor.focus();
            if (document.queryCommandSupported?.("insertText")) {
              document.execCommand("insertText", false, text);
            } else {
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) return;
              selection.deleteFromDocument();
              selection.getRangeAt(0).insertNode(document.createTextNode(text));
              selection.collapseToEnd();
            }
            htmlCacheRef.current = editor.innerHTML;
            debouncedSyncRef.current();
          }}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
            debouncedSyncRef.current.cancel();
            htmlCacheRef.current = editorRef.current?.innerHTML ?? htmlCacheRef.current;
            syncFromEditor();
          }}
          onInput={() => {
            const editor = editorRef.current;
            if (editor) {
              htmlCacheRef.current = editor.innerHTML;
            }
            debouncedSyncRef.current();
          }}
        />
      </div>
    </section>
  );
}

function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = applyInlineHtml(escape(paragraph.join(" ")));
    blocks.push(`<p>${content}</p>`);
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const alignMatch = /^<div\s+align="(center|right)">(.+)<\/div>$/.exec(line);
    if (alignMatch) {
      flushParagraph();
      const align = alignMatch[1];
      const content = applyInlineHtml(escape(alignMatch[2]));
      blocks.push(`<div style="text-align:${align}">${content}</div>`);
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const content = applyInlineHtml(escape(headingMatch[2]));
      blocks.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks.join("");
}

function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  const blocks: string[] = [];

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push(text);
      }
      continue;
    }

    if (!(node instanceof HTMLElement)) continue;

    const tag = node.tagName.toLowerCase();
    const align = node.style.textAlign;
    const content = serializeInline(node).trim();

    if (!content) continue;

    if (tag === "h1") {
      blocks.push(`# ${content}`);
    } else if (tag === "h2") {
      blocks.push(`## ${content}`);
    } else if (tag === "h3") {
      blocks.push(`### ${content}`);
    } else if (align === "center" || align === "right") {
      blocks.push(`<div align="${align}">${content}</div>`);
    } else {
      blocks.push(content);
    }
  }

  return blocks.join("\n\n");
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(serializeInline).join("");
  if (tag === "strong" || tag === "b") {
    return `**${children}**`;
  }
  if (tag === "em" || tag === "i") {
    return `*${children}*`;
  }
  if (tag === "br") {
    return "\n";
  }
  return children;
}

function applyInlineHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}
