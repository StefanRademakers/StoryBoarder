import { useEffect, useRef, useState } from "react";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("New Project");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.select(), 0);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    try {
      setBusy(true);
      await onCreate(trimmed);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Create new project</h3>
        </div>
        <div className="form-section">
          <label className="form-row">
            <h2 className="section-title">Project name</h2>
            <input
              ref={inputRef}
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </label>
        </div>
        <div className="modal__footer">
          <button className="pill-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="pill-button" type="button" onClick={submit} disabled={busy || !name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
}