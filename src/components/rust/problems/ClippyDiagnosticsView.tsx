/**
 * ClippyDiagnosticsView.tsx — Tab 4 component rendering Cargo Clippy diagnostics
 */

import { VscPlay, VscRefresh, VscTools } from "react-icons/vsc";
import { ClippyDiagnostic, ClippyFixResult, ClippyProgress } from "../../../ipc/clippy";
import styles from "../ProblemsPanel.module.css";

interface ClippyDiagnosticsViewProps {
  clippyLoading: boolean;
  clippyProgress: ClippyProgress | null;
  runClippyDiagnostics: () => void;
  applyClippyWorkspaceFix: () => void;
  applyClippySingleFix: (filePath: string, suggestion: any) => void;
  clippyFixResult: ClippyFixResult | null;
  clippyError: string | null;
  clippyDiagnostics: ClippyDiagnostic[];
  selectedProblemKey: string | null;
  handleProblemClick: (filePath: string, line: number, column: number, key: string) => void;
}

export function ClippyDiagnosticsView({
  clippyLoading,
  clippyProgress,
  runClippyDiagnostics,
  applyClippyWorkspaceFix,
  applyClippySingleFix,
  clippyFixResult,
  clippyError,
  clippyDiagnostics,
  selectedProblemKey,
  handleProblemClick,
}: ClippyDiagnosticsViewProps) {
  return (
    <div className={styles.linterContainer}>
      <div className={styles.linterToolbar}>
        <div className={styles.linterToolbarLeft}>
          <button className={styles.runScanBtn} onClick={runClippyDiagnostics} disabled={clippyLoading}>
            {clippyLoading ? <VscRefresh className={styles.spinIcon} /> : <VscPlay />}
            {clippyLoading ? "Running cargo clippy..." : "Run Cargo Clippy"}
          </button>
          <button
            className={styles.runScanBtn}
            onClick={applyClippyWorkspaceFix}
            disabled={clippyLoading}
            style={{ backgroundColor: "#0284c7" }}
          >
            <VscTools /> Apply All Auto-Fixes
          </button>
        </div>
      </div>

      {clippyProgress && (
        <div className={styles.clippyProgressBox}>
          <VscRefresh className={styles.spinIcon} />
          <span>{clippyProgress.message}</span>
        </div>
      )}

      {clippyFixResult && (
        <div className={styles.clippyFixResultBox}>
          Applied {clippyFixResult.fixes_applied} fixes across {clippyFixResult.files_modified.length} files.
        </div>
      )}
      {clippyError && <div className={styles.clippyErrorBox}>{clippyError}</div>}

      <div className={styles.linterFindingsList}>
        {clippyDiagnostics.length === 0 ? (
          <div className={styles.emptyState}>
            {clippyLoading
              ? "Clippy is running analysis..."
              : "No Clippy warnings found. Click 'Run Cargo Clippy' to scan workspace."}
          </div>
        ) : (
          clippyDiagnostics.map((diag, idx) => {
            const startLine = diag.range?.start_line || 0;
            const startCol = diag.range?.start_character || 0;
            const rowKey = `clippy-${idx}-${diag.file_path}-${startLine}`;
            const isSelected = selectedProblemKey === rowKey;

            return (
              <div
                key={rowKey}
                className={`${styles.findingCard} ${isSelected ? styles.findingCardActive : ''}`}
                onClick={() => handleProblemClick(diag.file_path, startLine, startCol, rowKey)}
              >
                <div className={styles.findingCardHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className={`${styles.findingSeverityBadge} ${styles.severityWarning}`}>
                      {diag.severity.toUpperCase()}
                    </span>
                    {diag.lint_name && <span className={styles.findingCheckId}>{diag.lint_name}</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {diag.suggestions && diag.suggestions.length > 0 && (
                      <button
                        className={styles.quickFixApplyBtn}
                        style={{ fontSize: "11px", padding: "2px 6px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          applyClippySingleFix(diag.file_path, diag.suggestions[0]);
                        }}
                      >
                        <VscTools /> Apply Fix
                      </button>
                    )}
                    <span className={styles.findingLocation}>
                      {diag.file_path}:{startLine}:{startCol}
                    </span>
                  </div>
                </div>
                <div className={styles.findingMessage}>{diag.message}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
