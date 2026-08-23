import { useEffect, useRef, useState } from 'react';
import styles from './GoToLineWidget.module.css';

interface GoToLineWidgetProps {
  isOpen: boolean;
  totalLines: number;
  onGoToLine: (line: number) => void;
  onClose: () => void;
}

export function GoToLineWidget({ isOpen, totalLines, onGoToLine, onClose }: GoToLineWidgetProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const lineNum = parseInt(value, 10);
      if (!isNaN(lineNum) && lineNum >= 1 && lineNum <= totalLines) {
        onGoToLine(lineNum - 1); // convert to 0-indexed
      }
      onClose();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Only allow digits
    if (/^\d*$/.test(raw)) setValue(raw);
  };

  return (
    <div className={styles.overlay}>
      <span className={styles.label}>Go to Line</span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={`1 – ${totalLines}`}
        aria-label="Go to line number"
      />
      <span className={styles.hint}>Enter to confirm, Esc to cancel</span>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}
