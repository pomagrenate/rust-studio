import { useEffect, useRef, useState } from "react";
import type { CodeAction } from "../../ipc/lsp";
import type { ClippyDiagnostic, ClippySuggestion } from "../../ipc/clippy";
import styles from "./QuickFixWidget.module.css";

interface QuickFixWidgetProps {
  actions: CodeAction[];
  clippyDiagnostics?: ClippyDiagnostic[];
  position: { x: number; y: number };
  onApply: (action: CodeAction) => void;
  onApplyClippyFix?: (filePath: string, suggestion: ClippySuggestion) => void;
  onClose: () => void;
}

export function QuickFixWidget({
  actions,
  clippyDiagnostics = [],
  position,
  onApply,
  onApplyClippyFix,
  onClose,
}: QuickFixWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Group actions by kind
  const quickFixActions = actions.filter(
    (a) => a.kind === "quickfix" || a.kind?.startsWith("quickfix")
  );
  const refactorActions = actions.filter(
    (a) => a.kind?.startsWith("refactor")
  );
  const generatorActions = actions.filter(
    (a) => a.kind?.startsWith("source")
  );

  // Filter machine-applicable Clippy diagnostics
  const clippyActions = clippyDiagnostics.filter(d => d.is_machine_applicable && d.suggestions.length > 0);

  const allActions = [...quickFixActions, ...refactorActions, ...generatorActions, ...clippyActions];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, allActions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          const selectedAction = allActions[selectedIndex];
          if (selectedAction) {
            // Check if this is a Clippy diagnostic
            if ('lint_name' in selectedAction) {
              const clippyDiag = selectedAction as ClippyDiagnostic;
              if (clippyDiag.suggestions.length > 0 && onApplyClippyFix) {
                onApplyClippyFix(clippyDiag.file_path, clippyDiag.suggestions[0]);
              }
            } else {
              onApply(selectedAction as CodeAction);
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [allActions, selectedIndex, onClose, onApply]);

  const getActionIcon = (kind?: string) => {
    if (kind === "quickfix" || kind?.startsWith("quickfix")) {
      return "⚡";
    }
    if (kind?.startsWith("refactor")) {
      return "🔧";
    }
    if (kind?.startsWith("source")) {
      return "✨";
    }
    return "💡";
  };

  const renderActionSection = (
    title: string,
    sectionActions: CodeAction[],
    startIndex: number
  ) => {
    if (sectionActions.length === 0) return null;

    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{title}</div>
        {sectionActions.map((action, idx) => {
          const globalIndex = startIndex + idx;
          const isSelected = globalIndex === selectedIndex;
          return (
            <div
              key={globalIndex}
              className={`${styles.actionItem} ${isSelected ? styles.selected : ""}`}
              onClick={() => onApply(action)}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
            >
              <span className={styles.actionIcon}>
                {getActionIcon(action.kind)}
              </span>
              <span className={styles.actionTitle}>{action.title}</span>
              {action.is_preferred && (
                <span className={styles.preferredBadge}>★</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderClippySection = (
    title: string,
    sectionActions: ClippyDiagnostic[],
    startIndex: number
  ) => {
    if (sectionActions.length === 0) return null;

    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{title}</div>
        {sectionActions.map((diag, idx) => {
          const globalIndex = startIndex + idx;
          const isSelected = globalIndex === selectedIndex;
          return (
            <div
              key={globalIndex}
              className={`${styles.actionItem} ${isSelected ? styles.selected : ""}`}
              onClick={() => {
                if (diag.suggestions.length > 0 && onApplyClippyFix) {
                  onApplyClippyFix(diag.file_path, diag.suggestions[0]);
                }
              }}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
            >
              <span className={styles.actionIcon}>🔨</span>
              <span className={styles.actionTitle}>
                {diag.lint_name}: {diag.message}
              </span>
              {diag.is_machine_applicable && (
                <span className={styles.preferredBadge}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  let currentIndex = 0;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {renderActionSection("Quick Fixes", quickFixActions, currentIndex)}
      {currentIndex += quickFixActions.length}
      {renderActionSection("Refactor", refactorActions, currentIndex)}
      {currentIndex += refactorActions.length}
      {renderActionSection("Generate", generatorActions, currentIndex)}
      {currentIndex += generatorActions.length}
      {renderClippySection("Clippy Fixes", clippyActions, currentIndex)}
      
      {allActions.length === 0 && (
        <div className={styles.emptyState}>No actions available</div>
      )}
      
      <div className={styles.footer}>
        <span className={styles.shortcutHint}>
          ↑↓ Navigate • Enter Apply • Esc Close
        </span>
      </div>
    </div>
  );
}
