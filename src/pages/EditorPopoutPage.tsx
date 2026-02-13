import { useEffect, useMemo, useState } from "react";
import type { ProjectState } from "../state/types";
import { electron } from "../services/electron";
import { MdxTextSection } from "../components/common/MdxTextSection";

interface EditorPopoutPageProps {
  project: ProjectState;
  targetPath: string;
  title: string;
}

export function EditorPopoutPage({ project, targetPath, title }: EditorPopoutPageProps) {
  const [value, setValue] = useState("");
  const fileName = useMemo(() => {
    const normalized = targetPath.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? normalized : normalized.slice(idx + 1);
  }, [targetPath]);

  const loadContent = async () => {
    const exists = await electron.exists(targetPath);
    if (!exists) {
      await electron.writeText(targetPath, "");
      setValue("");
      return;
    }
    const content = await electron.readText(targetPath);
    setValue(content);
  };

  useEffect(() => {
    void loadContent();
  }, [targetPath]);

  useEffect(() => {
    const onFocus = () => {
      void loadContent();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [targetPath]);

  useEffect(() => {
    void electron.setWindowTitle(title || fileName || "Popout Editor");
  }, [title, fileName]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title || fileName}</h1>
          <p className="page-subtitle">{fileName}</p>
        </div>
      </header>
      <MdxTextSection
        key={targetPath}
        value={value}
        onChange={(markdown) => setValue(markdown)}
        projectRoot={project.paths.root}
        fileName={fileName}
        targetPath={targetPath}
        placeholder="Write..."
      />
    </div>
  );
}
