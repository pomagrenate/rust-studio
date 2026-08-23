import { useEffect, useRef } from "react";
import {
  VscNewFile,
  VscNewFolder,
  VscSymbolStructure,
  VscFiles,
  VscCopy,
  VscClippy,
  VscEdit,
  VscTrash,
  VscFolderOpened,
  VscDiff
} from "react-icons/vsc";
import styles from "./ExplorerContextMenu.module.css";

export interface ExplorerContextMenuProps {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
  activeFile?: string;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onNewRustModule: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShowInFolder: () => void;
  onCompareWithActive?: () => void;
}

export function ExplorerContextMenu({
  x,
  y,
  path,
  isDir,
  activeFile,
  onClose,
  onNewFile,
  onNewFolder,
  onNewRustModule,
  onCut,
  onCopy,
  onPaste,
  onCopyPath,
  onCopyRelativePath,
  onRename,
  onDelete,
  onShowInFolder,
  onCompareWithActive,
}: ExplorerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust menu coordinates so it doesn't overflow viewport boundaries
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 340);

  const canCompare = activeFile && activeFile !== path && !isDir;

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ left: adjustedX, top: adjustedY }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.menuItem} onClick={() => { onNewFile(); onClose(); }}>
        <VscNewFile className={styles.icon} />
        <span className={styles.label}>New File...</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onNewFolder(); onClose(); }}>
        <VscNewFolder className={styles.icon} />
        <span className={styles.label}>New Directory...</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onNewRustModule(); onClose(); }}>
        <VscSymbolStructure className={styles.icon} />
        <span className={styles.label}>New Rust Module...</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.menuItem} onClick={() => { onCut(); onClose(); }}>
        <VscFiles className={styles.icon} />
        <span className={styles.label}>Cut</span>
        <span className={styles.shortcut}>Ctrl+X</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onCopy(); onClose(); }}>
        <VscCopy className={styles.icon} />
        <span className={styles.label}>Copy</span>
        <span className={styles.shortcut}>Ctrl+C</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onPaste(); onClose(); }}>
        <VscClippy className={styles.icon} />
        <span className={styles.label}>Paste</span>
        <span className={styles.shortcut}>Ctrl+V</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.menuItem} onClick={() => { onCopyPath(); onClose(); }}>
        <span className={styles.label}>Copy Path</span>
        <span className={styles.shortcut}>Shift+Alt+C</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onCopyRelativePath(); onClose(); }}>
        <span className={styles.label}>Copy Relative Path</span>
        <span className={styles.shortcut}>Ctrl+K Ctrl+Alt+C</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.menuItem} onClick={() => { onRename(); onClose(); }}>
        <VscEdit className={styles.icon} />
        <span className={styles.label}>Rename...</span>
        <span className={styles.shortcut}>F2</span>
      </div>

      <div className={styles.menuItem} onClick={() => { onDelete(); onClose(); }}>
        <VscTrash className={`${styles.icon} ${styles.dangerIcon}`} />
        <span className={`${styles.label} ${styles.dangerText}`}>Delete</span>
        <span className={styles.shortcut}>Delete</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.menuItem} onClick={() => { onShowInFolder(); onClose(); }}>
        <VscFolderOpened className={styles.icon} />
        <span className={styles.label}>Reveal in File Explorer</span>
      </div>

      {canCompare && onCompareWithActive && (
        <div className={styles.menuItem} onClick={() => { onCompareWithActive(); onClose(); }}>
          <VscDiff className={styles.icon} />
          <span className={styles.label}>Compare with Active File</span>
        </div>
      )}
    </div>
  );
}

export default ExplorerContextMenu;
