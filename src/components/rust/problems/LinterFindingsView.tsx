/**
 * LinterFindingsView.tsx — Tab 3 component rendering Pomai Linter controls & finding cards
 */

import React from "react";
import {
  VscPlay,
  VscRefresh,
  VscCopy,
  VscCheck,
  VscLightbulb
} from "react-icons/vsc";
import { LinterFinding, LinterReport } from "./types";
import { QuickFixBox } from "./QuickFixBox";
import { applySingleFindingFix } from "./quickFixHelpers";
import styles from "../ProblemsPanel.module.css";

interface LinterFindingsViewProps {
  isScanning: boolean;
  runLinterScan: () => void;
  linterPreset: string;
  setLinterPreset: (preset: string) => void;
  severityFilter: "ALL" | "ERROR" | "WARNING" | "INFO";
  setSeverityFilter: (filter: "ALL" | "ERROR" | "WARNING" | "INFO") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  copiedReport: boolean;
  handleCopyReport: () => void;
  filteredFindings: LinterFinding[];
  linterReport: LinterReport | null;
  selectedProblemKey: string | null;
  activeFixFindingKey: string | null;
  setActiveFixFindingKey: (key: string | null) => void;
  fixStatusMap: Record<string, string>;
  setFixStatusMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleProblemClick: (filePath: string, line: number, column: number, key: string) => void;
  workspaceRoot?: string;
  onReloadFile?: (filePath: string) => void;
  onOpenFile?: (filePath: string) => void;
}

export function LinterFindingsView({
  isScanning,
  runLinterScan,
  linterPreset,
  setLinterPreset,
  severityFilter,
  setSeverityFilter,
  searchQuery,
  setSearchQuery,
  copiedReport,
  handleCopyReport,
  filteredFindings,
  linterReport,
  selectedProblemKey,
  activeFixFindingKey,
  setActiveFixFindingKey,
  fixStatusMap,
  setFixStatusMap,
  handleProblemClick,
  workspaceRoot,
  onReloadFile,
  onOpenFile,
}: LinterFindingsViewProps) {
  return (
    <div className={styles.linterContainer}>
      {/* Linter Toolbar */}
      <div className={styles.linterToolbar}>
        <div className={styles.linterToolbarLeft}>
          <button className={styles.runScanBtn} onClick={runLinterScan} disabled={isScanning}>
            {isScanning ? <VscRefresh className={styles.spinIcon} /> : <VscPlay />}
            {isScanning ? "Scanning Workspace..." : "Run Linter Scan"}
          </button>

          {/* Preset Selector Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--pm-fg-muted, #57606a)" }}>Preset:</span>
            <select
              className={styles.presetSelect}
              value={linterPreset}
              onChange={(e) => setLinterPreset(e.target.value)}
            >
              <option value="auto">Auto Detect Presets</option>
              <option value="security">Security & Risk (OWASP/CWE)</option>
              <option value="reliability">Panic & Memory Safety</option>
              <option value="unsafe">Unsafe Audit</option>
              <option value="quality">Code Quality & Idioms</option>
              <option value="performance">Performance & Allocation</option>
            </select>
          </div>

          <div className={styles.filterPillsGroup}>
            {(["ALL", "ERROR", "WARNING", "INFO"] as const).map((sev) => (
              <button
                key={sev}
                className={`${styles.filterPillBtn} ${severityFilter === sev ? styles.filterPillBtnActive : ""}`}
                onClick={() => setSeverityFilter(sev)}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input
            type="text"
            className={styles.linterSearchInput}
            placeholder="Search check ID, message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {linterReport && (
            <button className={styles.iconBtn} title="Copy JSON Audit Report" onClick={handleCopyReport}>
              {copiedReport ? <VscCheck color="#22c55e" /> : <VscCopy />}
            </button>
          )}
        </div>
      </div>

      {/* Linter Findings List */}
      <div className={styles.linterFindingsList}>
        {filteredFindings.length === 0 ? (
          <div className={styles.emptyState}>
            {linterReport
              ? "No findings match the current filter criteria."
              : "Click 'Run Linter Scan' to analyze your workspace using Pomai Linter."}
          </div>
        ) : (
          filteredFindings.map((finding, idx) => {
            const findingKey = `linter-${idx}-${finding.path}-${finding.start_line}-${finding.start_col}`;
            const isSelected = selectedProblemKey === findingKey;
            const isFixActive = activeFixFindingKey === findingKey;
            const sevClass =
              finding.severity.toUpperCase() === "ERROR"
                ? styles.severityError
                : finding.severity.toUpperCase() === "WARNING"
                ? styles.severityWarning
                : styles.severityInfo;

            // Generate options for QuickFixBox based on check_id and message
            const quickFixOptions: Array<{ title: string; onApply: () => void }> = [];

            if (finding.check_id.includes("avoid-unwrap") || finding.message.includes("unwrap")) {
              quickFixOptions.push(
                {
                  title: "Replace .unwrap() with ? error propagation",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "unwrap-question", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                },
                {
                  title: 'Replace .unwrap() with .expect("...")',
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "unwrap-expect", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                },
                {
                  title: "Replace .unwrap() with .unwrap_or_default()",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "unwrap-default", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                }
              );
            } else if (finding.check_id.includes("hardcoded-secret") || finding.check_id.includes("security")) {
              quickFixOptions.push(
                {
                  title: "Move hardcoded secret to std::env::var(...) lookup",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "secret-env", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                },
                {
                  title: "Append // pomai:ignore-secret suppression comment",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "secret-ignore", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                }
              );
            } else if (finding.check_id.includes("pending-todo") || finding.message.includes("TODO")) {
              quickFixOptions.push(
                {
                  title: "Mark TODO annotation as resolved (// DONE)",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "todo-done", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                },
                {
                  title: "Assign author metadata (// TODO(audit): ...)",
                  onApply: () =>
                    applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "todo-annotate", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
                }
              );
            } else if (finding.check_id.includes("unsafe")) {
              quickFixOptions.push({
                title: "Prepend // SAFETY: Audited memory invariants",
                onApply: () =>
                  applySingleFindingFix(finding.path, finding.start_line, finding.check_id, "safety-comment", findingKey, workspaceRoot, onReloadFile, onOpenFile, setFixStatusMap),
              });
            } else {
              quickFixOptions.push({
                title: "Add #[allow(dead_code)] or suppression comment",
                onApply: () => setFixStatusMap((prev) => ({ ...prev, [findingKey]: "✓ Suppression note logged" })),
              });
            }

            return (
              <div
                key={findingKey}
                className={`${styles.findingCard} ${isSelected ? styles.findingCardActive : ""}`}
                onClick={() => handleProblemClick(finding.path, finding.start_line, finding.start_col, findingKey)}
              >
                <div className={styles.findingCardHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className={`${styles.findingSeverityBadge} ${sevClass}`}>
                      {finding.severity}
                    </span>
                    <span className={styles.findingCheckId}>{finding.check_id}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      className={`${styles.cardActionBtn} ${isFixActive ? styles.cardActionBtnActive : ""}`}
                      title="Suggested Quick Fix"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFixFindingKey(isFixActive ? null : findingKey);
                      }}
                    >
                      <VscLightbulb size={14} />
                    </button>

                    <span className={styles.findingLocation}>
                      {finding.path}:{finding.start_line}:{finding.start_col}
                    </span>
                  </div>
                </div>

                <div className={styles.findingMessage}>{finding.message}</div>

                {finding.code_snippet && (
                  <div className={styles.findingSnippet}>{finding.code_snippet}</div>
                )}

                {isFixActive && (
                  <QuickFixBox options={quickFixOptions} statusText={fixStatusMap[findingKey]} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
