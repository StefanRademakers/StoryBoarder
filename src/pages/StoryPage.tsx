import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectState } from "../state/types";
import { SidebarNav } from "../components/common/SidebarNav";
import { useAppState } from "../state/appState";
import { debounce } from "../utils/debounce";

const SECTIONS = [
  { key: "settings", label: "Project Settings" },
  { key: "script", label: "Script" },
  { key: "shotlist", label: "Shotlist" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

interface StoryPageProps {
  project: ProjectState;
}

export function StoryPage({ project }: StoryPageProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("settings");
  const { updateProject } = useAppState();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const lastSyncedMarkdownRef = useRef(project.script ?? "");
  const htmlCacheRef = useRef("");

  const syncFromEditor = useCallback((fallbackHtml?: string) => {
    const editor = editorRef.current;
    const html = editor?.innerHTML ?? fallbackHtml ?? htmlCacheRef.current;
    if (!html) return;
    const markdown = htmlToMarkdown(html);
    lastSyncedMarkdownRef.current = markdown;
    updateProject((draft) => {
      draft.script = markdown;
    });
  }, [updateProject]);

  const debouncedSyncRef = useRef(debounce(() => {
    syncFromEditor();
  }, 250));

  useEffect(() => () => debouncedSyncRef.current.cancel(), []);

  const applyBold = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("bold");
    htmlCacheRef.current = editor.innerHTML;
    syncFromEditor();
  };

  const applyHeader = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("formatBlock", false, "h2");
    htmlCacheRef.current = editor.innerHTML;
    syncFromEditor();
  };

  const applyAlign = (alignment: "justifyLeft" | "justifyCenter" | "justifyRight") => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(alignment);
    htmlCacheRef.current = editor.innerHTML;
    syncFromEditor();
  };

  const handleSectionSelect = (next: SectionKey) => {
    if (activeSection === "script" && next !== "script") {
      isFocusedRef.current = false;
      debouncedSyncRef.current.cancel();
      syncFromEditor(htmlCacheRef.current);
    }
    setActiveSection(next);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (activeSection !== "script") return;
    if (isFocusedRef.current) return;
    const markdown = project.script ?? "";
    if (markdown === lastSyncedMarkdownRef.current) return;
    const nextHtml = markdownToHtml(markdown);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    htmlCacheRef.current = editor.innerHTML;
    lastSyncedMarkdownRef.current = markdown;
  }, [project.script, activeSection]);

  useEffect(() => {
    return () => {
      debouncedSyncRef.current.cancel();
      syncFromEditor(htmlCacheRef.current);
    };
  }, [syncFromEditor]);

  useEffect(() => {
    if (activeSection !== "script") return;
    isFocusedRef.current = false;
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = markdownToHtml(project.script ?? "");
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    htmlCacheRef.current = editor.innerHTML;
  }, [activeSection, project.script]);

  return (
    <div className="page project-page project-page--with-sidebar">
      <SidebarNav
        items={SECTIONS}
        activeKey={activeSection}
        onSelect={handleSectionSelect}
        ariaLabel="Story sections"
      />

      <div className="project-page__content">
        <header className="page-header">
          <div>
            <h1>{activeSection === "script" ? "Script" : project.name}</h1>
            <p className="page-subtitle">Story workspace sections.</p>
          </div>
        </header>

        {activeSection === "settings" ? (
          <section className="panel">
            <h2 className="section-title">Project Settings</h2>
            <p className="muted">Content goes here.</p>
          </section>
        ) : null}

        {activeSection === "script" ? (
          <section className="panel script-panel">
            <div className="script-toolbar">
              <button type="button" className="pill-button" onClick={applyHeader}>
                Header
              </button>
              <button type="button" className="pill-button" onClick={applyBold}>
                Bold
              </button>
              <button type="button" className="pill-button" onClick={() => applyAlign("justifyLeft")}>
                Left
              </button>
              <button type="button" className="pill-button" onClick={() => applyAlign("justifyCenter")}>
                Center
              </button>
              <button type="button" className="pill-button" onClick={() => applyAlign("justifyRight")}>
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
        ) : null}

        {activeSection === "shotlist" ? (
          <section className="panel">
            <h2 className="section-title">Shotlist</h2>
            <p className="muted">Content goes here.</p>
          </section>
        ) : null}
      </div>
    </div>
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
