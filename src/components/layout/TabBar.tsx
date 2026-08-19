import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { VscFile, VscClose, VscCheck } from "react-icons/vsc";
import styles from "./TabBar.module.css";

interface TabBarProps {
  groupId: string;
  openFiles: string[];
  activeFile?: string;
  previewFile?: string | null;
  dirtyFiles: Set<string>;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  onSplitRight?: () => void;
  onCloseAll?: () => void;
  onCloseSaved?: () => void;
  onMoveTab?: (sourceGroupId: string, targetGroupId: string, file: string, newIndex: number) => void;
}

export function TabBar({
  groupId,
  openFiles,
  activeFile,
  previewFile,
  dirtyFiles,
  onSelectFile,
  onCloseFile,
  onSplitRight,
  onCloseAll,
  onCloseSaved,
  onMoveTab,
}: TabBarProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [enablePreviewEditors, setEnablePreviewEditors] = useState(true);
  const [isGroupLocked, setIsGroupLocked] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate portal position when menu opens
  const handleMoreClick = () => {
    if (!isMoreMenuOpen && moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setIsMoreMenuOpen((v) => !v);
  };

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedMenu = menuRef.current?.contains(target);
      const clickedBtn = moreButtonRef.current?.contains(target);
      if (!clickedMenu && !clickedBtn) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreMenuOpen]);

  // Portal-rendered dropdown — escapes all overflow/z-index stacking contexts
  const dropdownPortal = isMoreMenuOpen && menuPos
    ? createPortal(
        <div
          ref={menuRef}
          className={styles.moreDropdownMenu}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
        >
          <button className={styles.menuItem} onClick={() => setIsMoreMenuOpen(false)}>
            <span className={styles.menuCheck} />
            <span className={styles.menuLabel}>Show Opened Editors</span>
          </button>

          <div className={styles.menuSeparator} />

          <button
            className={styles.menuItem}
            onClick={() => { onCloseAll?.(); setIsMoreMenuOpen(false); }}
            disabled={openFiles.length === 0}
            style={{ opacity: openFiles.length === 0 ? 0.4 : 1 }}
          >
            <span className={styles.menuCheck} />
            <span className={styles.menuLabel}>Close All</span>
            <span className={styles.menuShortcut}>Ctrl+K W</span>
          </button>

          <button
            className={styles.menuItem}
            onClick={() => { onCloseSaved?.(); setIsMoreMenuOpen(false); }}
            disabled={openFiles.length === 0}
            style={{ opacity: openFiles.length === 0 ? 0.4 : 1 }}
          >
            <span className={styles.menuCheck} />
            <span className={styles.menuLabel}>Close Saved</span>
            <span className={styles.menuShortcut}>Ctrl+K U</span>
          </button>

          <div className={styles.menuSeparator} />

          <button
            className={styles.menuItem}
            onClick={() => { setEnablePreviewEditors((v) => !v); setIsMoreMenuOpen(false); }}
          >
            <span className={styles.menuCheck}>{enablePreviewEditors && <VscCheck />}</span>
            <span className={styles.menuLabel}>Enable Preview Editors</span>
          </button>

          <div className={styles.menuSeparator} />

          <button className={styles.menuItem} onClick={() => setIsMoreMenuOpen(false)}>
            <span className={styles.menuCheck} />
            <span className={styles.menuLabel}>Maximize Group</span>
            <span className={styles.menuShortcut}>Ctrl+K Ctrl+M</span>
          </button>

          <button
            className={styles.menuItem}
            onClick={() => { setIsGroupLocked((v) => !v); setIsMoreMenuOpen(false); }}
          >
            <span className={styles.menuCheck}>{isGroupLocked && <VscCheck />}</span>
            <span className={styles.menuLabel}>Lock Group</span>
          </button>

          <div className={styles.menuSeparator} />

          <button className={styles.menuItem} onClick={() => setIsMoreMenuOpen(false)}>
            <span className={styles.menuCheck} />
            <span className={styles.menuLabel}>Configure Editors</span>
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className={styles.tabBarContainer} role="tablist" aria-label="Open files">

        {/* ── Tab List ── */}
        <div
          className={styles.tabList}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => {
            e.preventDefault();
            try {
              const data = JSON.parse(e.dataTransfer.getData("text/plain"));
              if (data.type === "editor-tab" && onMoveTab) {
                onMoveTab(data.sourceGroupId, groupId, data.file, 0);
              }
            } catch {}
          }}
        >
          {openFiles.map((file) => (
            <div
              key={file}
              className={`${styles.tab} ${activeFile === file ? styles.tabActive : ""}`}
              role="tab"
              aria-selected={activeFile === file}
              onClick={() => onSelectFile(file)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "editor-tab",
                  sourceGroupId: groupId,
                  file,
                }));
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <VscFile className={styles.tabIcon} />
              <span
                className={styles.tabName}
                style={{ fontStyle: file === previewFile ? "italic" : "normal" }}
              >
                {file.split("\\").pop()?.split("/").pop()}
              </span>
              {dirtyFiles.has(file) && <span className={styles.tabDirtyIndicator}>•</span>}
              <button
                className={styles.tabClose}
                onClick={(e) => { e.stopPropagation(); onCloseFile(file); }}
                aria-label="Close tab"
              >
                <VscClose />
              </button>
            </div>
          ))}
        </div>

        {/* ── Editor Group Actions Toolbar (1 per group, fixed right) ── */}
        <div className={styles.editorActionsToolbar}>
          {/* Split Editor Right */}
          <button
            className={styles.actionButton}
            title="Split Editor Right"
            onClick={onSplitRight}
            aria-label="Split Editor Right"
            disabled={openFiles.length === 0}
            style={{
              opacity: openFiles.length === 0 ? 0.35 : 1,
              cursor: openFiles.length === 0 ? "default" : "pointer",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="14" rx="1" opacity="0.85"/>
              <rect x="9" y="1" width="6" height="6" rx="1" opacity="0.85"/>
              <rect x="9" y="9" width="6" height="6" rx="1" opacity="0.85"/>
            </svg>
          </button>

          {/* More Actions ⋯ */}
          <button
            ref={moreButtonRef}
            className={styles.actionButton}
            title="More Actions..."
            aria-label="More Actions"
            onClick={handleMoreClick}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="2.5" cy="8" r="1.4"/>
              <circle cx="8" cy="8" r="1.4"/>
              <circle cx="13.5" cy="8" r="1.4"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown rendered via portal to escape stacking contexts */}
      {dropdownPortal}
    </>
  );
}

export default TabBar;
