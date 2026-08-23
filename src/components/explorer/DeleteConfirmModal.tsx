import { useEffect } from "react";
import { VscWarning, VscTrash } from "react-icons/vsc";
import styles from "./DeleteConfirmModal.module.css";

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  targetPaths: string[];
  onConfirm: (useTrash: boolean) => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  targetPaths,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm(true); // Default to move to trash / delete
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen || !targetPaths || targetPaths.length === 0) return null;

  const isMultiple = targetPaths.length > 1;
  const firstFileName = targetPaths[0].split(/[/\\]/).pop() || targetPaths[0];

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <VscWarning className={styles.warningIcon} />
          <span className={styles.title}>Confirm Delete</span>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>
            {isMultiple ? (
              <>Are you sure you want to delete <strong>{targetPaths.length} selected items</strong>?</>
            ) : (
              <>Are you sure you want to delete <strong>"{firstFileName}"</strong>?</>
            )}
          </p>
          <div className={styles.subtext} style={{ maxHeight: "120px", overflowY: "auto" }}>
            {targetPaths.map(p => (
              <div key={p} style={{ fontSize: "12px", fontFamily: "var(--pm-font-mono)", opacity: 0.85 }}>
                <code>{p}</code>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.deleteBtn} onClick={() => onConfirm(false)}>
            <VscTrash size={14} />
            <span>Delete Permanently</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
