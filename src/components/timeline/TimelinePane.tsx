import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
  VscChevronRight, 
  VscChevronDown, 
  VscPin, 
  VscPinned, 
  VscRefresh, 
  VscFilter, 
  VscEllipsis, 
  VscGitCommit, 
  VscHistory,
  VscCheck
} from "react-icons/vsc";
import { extensionRegistry } from "../../extensions/extensionRegistry";
import { ITimelineItem } from "../../extensions/types";
import styles from "./TimelinePane.module.css";

interface TimelinePaneProps {
  activeFile?: string;
}

export function TimelinePane({ activeFile }: TimelinePaneProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [pinnedFile, setPinnedFile] = useState<string | undefined>(undefined);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [includeGit, setIncludeGit] = useState(true);
  const [includeLocal, setIncludeLocal] = useState(true);
  const [entries, setEntries] = useState<ITimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filterMenuPos, setFilterMenuPos] = useState({ top: 0, left: 0 });
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, left: 0 });

  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const targetFile = isPinned ? (pinnedFile || activeFile) : activeFile;

  const fetchTimeline = useCallback(async () => {
    if (!targetFile || targetFile === "Welcome" || targetFile.startsWith("Untitled")) {
      setEntries([]);
      return;
    }

    setIsLoading(true);
    try {
      const items = await extensionRegistry.getTimeline(targetFile);
      setEntries(items);
    } catch (err) {
      console.error("Timeline error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [targetFile]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    if (isFilterMenuOpen && filterBtnRef.current) {
      const rect = filterBtnRef.current.getBoundingClientRect();
      const menuHeight = 110;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight 
        ? Math.max(8, rect.top - menuHeight - 4) 
        : rect.bottom + 4;
      const left = Math.max(8, rect.right - 180);
      setFilterMenuPos({ top, left });
    }
  }, [isFilterMenuOpen]);

  useEffect(() => {
    if (isMoreMenuOpen && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect();
      const menuHeight = 100;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight 
        ? Math.max(8, rect.top - menuHeight - 4) 
        : rect.bottom + 4;
      const left = Math.max(8, rect.right - 220);
      setMoreMenuPos({ top, left });
    }
  }, [isMoreMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterMenuRef.current && 
        !filterMenuRef.current.contains(e.target as Node) &&
        filterBtnRef.current &&
        !filterBtnRef.current.contains(e.target as Node)
      ) {
        setIsFilterMenuOpen(false);
      }
      if (
        moreMenuRef.current && 
        !moreMenuRef.current.contains(e.target as Node) &&
        moreBtnRef.current &&
        !moreBtnRef.current.contains(e.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isMoreMenuOpen || isFilterMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMoreMenuOpen, isFilterMenuOpen]);

  const handleTogglePin = () => {
    if (!isPinned) {
      setPinnedFile(activeFile);
      setIsPinned(true);
    } else {
      setIsPinned(false);
      setPinnedFile(undefined);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (e.source === "git" && !includeGit) return false;
    if (e.source === "local-history" && !includeLocal) return false;
    return true;
  });

  return (
    <div className={`${styles.timelineSection} ${!isExpanded ? styles.timelineSectionCollapsed : ""}`}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.headerTitle}>
          {isExpanded ? <VscChevronDown /> : <VscChevronRight />}
          <span>Timeline</span>
          {targetFile && targetFile !== "Welcome" && (
            <span className={styles.fileHint}>
              ({targetFile.split(/[/\\]/).pop()})
            </span>
          )}
        </div>

        <div className={`${styles.headerActions} ${(isFilterMenuOpen || isMoreMenuOpen) ? styles.headerActionsOpen : ""}`} onClick={(e) => e.stopPropagation()}>
          <button 
            className={`${styles.actionBtn} ${isPinned ? styles.activePin : ""}`} 
            title={isPinned ? "Unpin Timeline" : "Pin Timeline"}
            onClick={handleTogglePin}
          >
            {isPinned ? <VscPinned /> : <VscPin />}
          </button>

          <button 
            className={styles.actionBtn} 
            title="Refresh Timeline"
            onClick={fetchTimeline}
          >
            <VscRefresh style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
          </button>

          <button 
            ref={filterBtnRef}
            className={styles.actionBtn} 
            title="Filter Timeline"
            onClick={() => {
              setIsFilterMenuOpen(!isFilterMenuOpen);
              setIsMoreMenuOpen(false);
            }}
          >
            <VscFilter />
          </button>

          {isFilterMenuOpen && typeof document !== "undefined" && createPortal(
            <div 
              ref={filterMenuRef}
              className={styles.menuDropdown}
              style={{
                position: "fixed",
                top: `${filterMenuPos.top}px`,
                left: `${filterMenuPos.left}px`,
                zIndex: 9999
              }}
            >
              <div className={styles.menuGroupTitle}>Timeline Sources</div>
              <button 
                className={styles.menuItem} 
                onClick={() => setIncludeGit(!includeGit)}
              >
                <span className={styles.menuCheck}>{includeGit && <VscCheck />}</span>
                <span>Git History</span>
              </button>
              <button 
                className={styles.menuItem} 
                onClick={() => setIncludeLocal(!includeLocal)}
              >
                <span className={styles.menuCheck}>{includeLocal && <VscCheck />}</span>
                <span>Local History</span>
              </button>
            </div>,
            document.body
          )}

          <button 
            ref={moreBtnRef}
            className={styles.actionBtn} 
            title="More Actions..."
            onClick={() => {
              setIsMoreMenuOpen(!isMoreMenuOpen);
              setIsFilterMenuOpen(false);
            }}
          >
            <VscEllipsis />
          </button>

          {isMoreMenuOpen && typeof document !== "undefined" && createPortal(
            <div 
              ref={moreMenuRef}
              className={styles.menuDropdown}
              style={{
                position: "fixed",
                top: `${moreMenuPos.top}px`,
                left: `${moreMenuPos.left}px`,
                zIndex: 9999
              }}
            >
              <button 
                className={styles.menuItem} 
                onClick={() => { fetchTimeline(); setIsMoreMenuOpen(false); }}
              >
                <span>Local History: Find Entry to Restore...</span>
              </button>
              <div className={styles.menuDivider} />
              <button 
                className={styles.menuItem} 
                onClick={() => { setIsPinned(false); setPinnedFile(undefined); setIsMoreMenuOpen(false); }}
              >
                <span>Unpin All</span>
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.body}>
          {filteredEntries.length > 0 ? (
            <div className={styles.entryList}>
              {filteredEntries.map((entry) => (
                <div key={entry.id} className={styles.entryRow} title={`${entry.label}\n${entry.detail}`}>
                  <div className={styles.timelineNode}>
                    <div className={styles.verticalTrack} />
                    <span className={styles.nodeIcon}>
                      {entry.source === "git" ? <VscGitCommit /> : <VscHistory />}
                    </span>
                  </div>

                  <div className={styles.entryContent}>
                    <div className={styles.entryLabel}>{entry.label}</div>
                    <div className={styles.entryMeta}>
                      <span className={styles.entryAuthor}>{entry.author}</span>
                      <span className={styles.entryDate}>{entry.relativeDate}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              {targetFile && targetFile !== "Welcome" ? "No history for this file" : "No active editor"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TimelinePane;