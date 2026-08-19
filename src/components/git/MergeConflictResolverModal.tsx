/**
 * MergeConflictResolverModal.tsx
 * Visual 3-Way Merge Conflict Resolver Modal:
 * Left: Current (HEAD / Ours)
 * Center: Incoming (Branch / Theirs)
 * Right: Editable Live Result Buffer
 */

import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscClose,
  VscChevronLeft,
  VscChevronRight,
  VscCheck,
  VscCheckAll,
  VscArrowLeft,
  VscArrowRight
} from "react-icons/vsc";
import {
  MergeConflictBlock,
  findMergeConflicts,
  resolveSingleConflict,
  resolveAllConflicts
} from "../../extensions/builtin/git/MergeConflictParser";
import styles from "./MergeConflictResolverModal.module.css";

interface MergeConflictResolverModalProps {
  filePath: string;
  repoPath?: string;
  initialContent: string;
  onSaveAndResolve: (resolvedContent: string) => void;
  onClose: () => void;
}

export function MergeConflictResolverModal({
  filePath,
  repoPath,
  initialContent,
  onSaveAndResolve,
  onClose,
}: MergeConflictResolverModalProps) {
  const [currentLines, setCurrentLines] = useState<string[]>(() =>
    initialContent.split(/\r?\n/)
  );
  const [currentConflictIdx, setCurrentConflictIdx] = useState<number>(0);

  // Discover live conflicts in current buffer
  const conflicts: MergeConflictBlock[] = useMemo(() => {
    return findMergeConflicts(currentLines);
  }, [currentLines]);

  const activeConflict: MergeConflictBlock | undefined = conflicts[currentConflictIdx] || conflicts[0];

  const handleResolveSingle = (choice: "current" | "incoming" | "both-current-first" | "both-incoming-first") => {
    if (!activeConflict) return;
    const nextLines = resolveSingleConflict(currentLines, activeConflict, choice);
    setCurrentLines(nextLines);
    if (currentConflictIdx >= conflicts.length - 1 && currentConflictIdx > 0) {
      setCurrentConflictIdx(currentConflictIdx - 1);
    }
  };

  const handleResolveAll = (choice: "current" | "incoming") => {
    const nextLines = resolveAllConflicts(currentLines, choice);
    setCurrentLines(nextLines);
    setCurrentConflictIdx(0);
  };

  const handleCompleteAndStage = async () => {
    const resolvedText = currentLines.join("\n");
    if (repoPath && window.__TAURI_INTERNALS__) {
      try {
        await invoke("git_resolve_conflict_file", {
          repoPath,
          filePath,
          resolvedContent: resolvedText,
        });
      } catch (err) {
        console.error("Failed to git resolve & stage:", err);
      }
    }
    onSaveAndResolve(resolvedText);
  };

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* ── Modal Header ── */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.modalTitle}>3-Way Merge Resolver</span>
            <span className={styles.fileNameBadge}>{fileName}</span>
          </div>

          <div className={styles.headerCenter}>
            {conflicts.length > 0 ? (
              <>
                <button
                  className={styles.navBtn}
                  disabled={currentConflictIdx <= 0}
                  onClick={() => setCurrentConflictIdx((i) => Math.max(0, i - 1))}
                  title="Previous Conflict"
                >
                  <VscChevronLeft />
                </button>
                <span className={styles.navCounter}>
                  Conflict {currentConflictIdx + 1} of {conflicts.length}
                </span>
                <button
                  className={styles.navBtn}
                  disabled={currentConflictIdx >= conflicts.length - 1}
                  onClick={() =>
                    setCurrentConflictIdx((i) => Math.min(conflicts.length - 1, i + 1))
                  }
                  title="Next Conflict"
                >
                  <VscChevronRight />
                </button>
              </>
            ) : (
              <span className={styles.navCounter} style={{ color: "#1a7f37" }}>
                ✓ All conflicts resolved
              </span>
            )}
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.stageBtn}
              onClick={handleCompleteAndStage}
              title="Save file and mark resolved with git add"
            >
              <VscCheck />
              <span>Complete Merge</span>
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="Close Resolver">
              <VscClose size={18} />
            </button>
          </div>
        </div>

        {/* ── 3-Way Split Comparison Body ── */}
        <div className={styles.comparisonBody}>
          {/* Left Pane: Current (HEAD / Ours) */}
          <div className={styles.sidePane}>
            <div className={styles.paneHeaderCurrent}>
              <span>Current (HEAD)</span>
              {activeConflict && (
                <button
                  className={styles.paneActionBtn}
                  onClick={() => handleResolveSingle("current")}
                  title="Accept Current"
                >
                  <VscArrowRight />
                  <span>Accept Current</span>
                </button>
              )}
            </div>
            <div className={styles.codeArea}>
              {activeConflict ? (
                <div>
                  <div style={{ color: "var(--pm-fg-muted)", marginBottom: "4px" }}>
                    // {activeConflict.currentHeader}
                  </div>
                  <div style={{ color: "#1a7f37", fontWeight: 500 }}>
                    {activeConflict.currentContent.join("\n") || "/* (Empty block) */"}
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--pm-fg-muted)" }}>No active conflict.</div>
              )}
            </div>
          </div>

          {/* Middle Pane: Incoming (Branch / Theirs) */}
          <div className={styles.sidePane}>
            <div className={styles.paneHeaderIncoming}>
              <span>Incoming (Branch)</span>
              {activeConflict && (
                <button
                  className={styles.paneActionBtn}
                  onClick={() => handleResolveSingle("incoming")}
                  title="Accept Incoming"
                >
                  <VscArrowLeft />
                  <span>Accept Incoming</span>
                </button>
              )}
            </div>
            <div className={styles.codeArea}>
              {activeConflict ? (
                <div>
                  <div style={{ color: "var(--pm-fg-muted)", marginBottom: "4px" }}>
                    // {activeConflict.incomingHeader}
                  </div>
                  <div style={{ color: "var(--pm-accent, #005fb8)", fontWeight: 500 }}>
                    {activeConflict.incomingContent.join("\n") || "/* (Empty block) */"}
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--pm-fg-muted)" }}>No active conflict.</div>
              )}
            </div>
          </div>

          {/* Right Pane: Editable Live Merged Result */}
          <div className={styles.sidePane}>
            <div className={styles.paneHeaderResult}>
              <span>Result Preview & Editor</span>
              <span style={{ fontSize: "11px", color: "var(--pm-fg-muted)" }}>
                {currentLines.length} lines
              </span>
            </div>
            <textarea
              className={styles.resultTextarea}
              value={currentLines.join("\n")}
              onChange={(e) => setCurrentLines(e.target.value.split(/\r?\n/))}
              placeholder="Resulting merged content will appear here..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* ── Bottom Per-Conflict Action Toolbar ── */}
        <div className={styles.conflictToolbar}>
          <div className={styles.conflictActionsGroup}>
            {activeConflict && (
              <>
                <button
                  className={styles.actionButton}
                  style={{ backgroundColor: "rgba(26, 127, 55, 0.12)", color: "#1a7f37" }}
                  onClick={() => handleResolveSingle("current")}
                >
                  Accept Current
                </button>
                <button
                  className={styles.actionButton}
                  style={{ backgroundColor: "rgba(0, 95, 184, 0.12)", color: "var(--pm-accent, #005fb8)" }}
                  onClick={() => handleResolveSingle("incoming")}
                >
                  Accept Incoming
                </button>
                <button
                  className={styles.actionButton}
                  style={{ backgroundColor: "rgba(154, 103, 0, 0.12)", color: "#9a6700" }}
                  onClick={() => handleResolveSingle("both-current-first")}
                >
                  Accept Both (Current First)
                </button>
                <button
                  className={styles.actionButton}
                  style={{ backgroundColor: "rgba(154, 103, 0, 0.12)", color: "#9a6700" }}
                  onClick={() => handleResolveSingle("both-incoming-first")}
                >
                  Accept Both (Incoming First)
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className={styles.actionButton}
              onClick={() => handleResolveAll("current")}
              title="Resolve all conflicts in file with Current changes"
            >
              <VscCheckAll />
              <span>Accept All Current</span>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => handleResolveAll("incoming")}
              title="Resolve all conflicts in file with Incoming changes"
            >
              <VscCheckAll />
              <span>Accept All Incoming</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MergeConflictResolverModal;
