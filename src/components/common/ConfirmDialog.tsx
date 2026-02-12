interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
        </div>
        <p className="muted">{message}</p>
        <div className="modal__footer">
          <button type="button" className="pill-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="pill-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
