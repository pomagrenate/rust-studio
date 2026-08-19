import styles from "./SavePrompt.module.css";

interface SavePromptProps {
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SavePrompt({ fileName, onSave, onDiscard, onCancel }: SavePromptProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-labelledby="save-prompt-title">
        <div className={styles.header}>
          <h2 id="save-prompt-title" className={styles.title}>Save Changes</h2>
        </div>
        <div className={styles.body}>
          <p>Do you want to save the changes you made to <strong>{fileName}</strong>?</p>
          <p className={styles.subtitle}>Your changes will be lost if you don't save them.</p>
        </div>
        <div className={styles.footer}>
          <button className={`${styles.button} ${styles.primary}`} onClick={onSave}>Save</button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={onDiscard}>Don't Save</button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
