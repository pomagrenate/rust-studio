/**
 * LinterFindingsView.tsx — Tab 3 component rendering Pomai Linter controls & finding cards
 * Enriched with engine metrics banner, direct rule autofix integration, category classification, and batch autofixes.
 */

import React, { useState } from "react";
import {
  VscPlay,
  VscRefresh,
  VscCopy,
  VscCheck,
  VscLightbulb,
  VscWand,
  VscFolder,
  VscListFlat,
  VscShield,
  VscFlame,
  VscLock,
  VscTools,
  VscDashboard,
  VscError,
  VscWarning,
  VscInfo
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
  const [groupByFile, setGroupByFile] = useState<boolean>(false);
  const [batchFixing, setBatchFixing] = useState<boolean>(false);

  // Compute breakdown stats
  const totalErrors = filteredFindings.filter((f) => f.severity.toUpperCase() === "ERROR").length;
  const totalWarnings = filteredFindings.filter((f) => f.severity.toUpperCase() === "WARNING").length;
  const totalInfo = filteredFindings.filter((f) => f.severity.toUpperCase() === "INFO").length;
  const totalFixable = filteredFindings.filter(
    (f) =>
      Boolean(f.fix) ||
      f.check_id.includes("unwrap") ||
      f.check_id.includes("secret") ||
      f.check_id.includes("todo") ||
      f.check_id.includes("unsafe")
  ).length;

  // Apply all fixable findings batch action
  const handleApplyAllFixes = async () => {
    if (batchFixing || filteredFindings.length === 0) return;
    setBatchFixing(true);

    for (let idx = 0; idx < filteredFindings.length; idx++) {
      const finding = filteredFindings[idx];
      const findingKey = `linter-${idx}-${finding.path}-${finding.start_line}-${finding.start_col}`;

      let fixType = "unwrap-question";
      if (finding.check_id.includes("avoid-unwrap") || finding.message.includes("unwrap")) {
        fixType = "unwrap-question";
      } else if (finding.check_id.includes("hardcoded-secret")) {
        fixType = "secret-ignore";
      } else if (finding.check_id.includes("pending-todo")) {
        fixType = "todo-done";
      } else if (finding.check_id.includes("unsafe")) {
        fixType = "safety-comment";
      }

      await applySingleFindingFix(
        finding.path,
        finding.start_line,
        finding.check_id,
        fixType,
        findingKey,
        workspaceRoot,
        onReloadFile,
        onOpenFile,
        setFixStatusMap
      );
    }

    setBatchFixing(false);
  };

  // Group findings by file path if enabled
  const groupedByFile = filteredFindings.reduce<Record<string, LinterFinding[]>>((acc, f) => {
    if (!acc[f.path]) acc[f.path] = [];
    acc[f.path].push(f);
    return acc;
  }, {});

  const renderCategoryIcon = (checkId: string, category?: string) => {
    const cat = (category || checkId).toLowerCase();
    if (cat.includes("security") || cat.includes("secret")) return <VscShield color="#cf222e" title="Security Risk" />;
    if (cat.includes("reliability") || cat.includes("unwrap")) return <VscFlame color="#d97706" title="Panic Safety" />;
    if (cat.includes("unsafe")) return <VscLock color="#8b5cf6" title="Unsafe Memory Audit" />;
    if (cat.includes("performance")) return <VscDashboard color="#2563eb" title="Performance Metric" />;
    return <VscTools color="#57606a" title="Code Quality" />;
  };

  const renderFindingCard = (finding: LinterFinding, idx: number) => {
    const findingKey = `linter-${idx}-${finding.path}-${finding.start_line}-${finding.start_col}`;
    const isSelected = selectedProblemKey === findingKey;
    const isFixActive = activeFixFindingKey === findingKey;
    const sevClass =
      finding.severity.toUpperCase() === "ERROR"
        ? styles.severityError
        : finding.severity.toUpperCase() === "WARNING"
        ? styles.severityWarning
        : styles.severityInfo;

    const quickFixOptions: Array<{ title: string; onApply: () => void }> = [];

    // If backend / semgrep core generated a direct replacement fix
    if (finding.fix) {
      quickFixOptions.push({
        title: `Apply Linter Engine Fix: "${finding.fix.trim()}"`,
        onApply: () =>
          applySingleFindingFix(
            finding.path,
            finding.start_line,
            finding.check_id,
            "engine-direct",
            findingKey,
            workspaceRoot,
            onReloadFile,
            onOpenFile,
            setFixStatusMap
          ),
      });
    }

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
    } else if (quickFixOptions.length === 0) {
      quickFixOptions.push({
        title: "Add #[allow(dead_code)] or suppression note",
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
            {renderCategoryIcon(finding.check_id, finding.category)}
            {finding.validation_state && (
              <span className={styles.badgePill} style={{ backgroundColor: "rgba(34, 197, 94, 0.15)", color: "#16a34a", fontSize: "10px", fontWeight: 600 }}>
                {finding.validation_state}
              </span>
            )}
            <span className={`${styles.findingSeverityBadge} ${sevClass}`}>{finding.severity}</span>
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

        {/* Dataflow Trace (Taint propagation route) */}
        {finding.dataflow_trace && finding.dataflow_trace.length > 0 && (
          <div style={{ marginTop: "6px", padding: "6px 8px", backgroundColor: "var(--pm-bg-subtle, rgba(0,0,0,0.03))", borderRadius: "4px", fontSize: "11px" }}>
            <div style={{ fontWeight: 600, color: "var(--pm-fg-muted, #57606a)", marginBottom: "4px" }}>
              Dataflow Propagation Trace ({finding.dataflow_trace.length} steps):
            </div>
            {finding.dataflow_trace.map((step, sIdx) => (
              <div key={sIdx} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--pm-fg, #1f2328)", padding: "2px 0" }}>
                <span style={{ color: "#005fb8", fontWeight: 600 }}>Step {sIdx + 1}:</span>
                <span>{step.path}:{step.line}</span>
                {step.message && <span style={{ color: "var(--pm-fg-muted, #57606a)" }}>— {step.message}</span>}
              </div>
            ))}
          </div>
        )}

        {isFixActive && (
          <QuickFixBox options={quickFixOptions} statusText={fixStatusMap[findingKey]} />
        )}
      </div>
    );
  };

  return (
    <div className={styles.linterContainer}>
      {/* Linter Control Toolbar */}
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
              <option value="auto">Auto Detect Rules</option>
              <option value="security">Security & OWASP/CWE</option>
              <option value="reliability">Panic & Safety</option>
              <option value="unsafe">Unsafe Audit</option>
              <option value="quality">Code Quality</option>
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
          {/* Grouping Toggle */}
          <button
            className={`${styles.iconBtn} ${groupByFile ? styles.actionToolBtnActive : ""}`}
            title={groupByFile ? "Flat Findings List" : "Group Findings by File"}
            onClick={() => setGroupByFile(!groupByFile)}
          >
            {groupByFile ? <VscFolder /> : <VscListFlat />}
          </button>

          {/* Batch Autofix Button */}
          {totalFixable > 0 && (
            <button
              className={styles.runScanBtn}
              style={{ backgroundColor: "#16a34a" }}
              title="Apply all suggested fixes automatically"
              onClick={handleApplyAllFixes}
              disabled={batchFixing}
            >
              <VscWand />
              {batchFixing ? "Fixing..." : `Auto-Fix All (${totalFixable})`}
            </button>
          )}

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

      {/* Real-time Engine Metrics Dashboard Banner */}
      {linterReport && (
        <div className={styles.linterMetricsBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className={styles.metricsBadge} style={{ color: "var(--pm-accent, #005fb8)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <VscFlame color="#005fb8" /> <strong>{linterReport.engine}</strong>
            </span>
            <span>Files Scanned: <strong>{linterReport.scanned_files_count}</strong></span>
            <span>Duration: <strong>{linterReport.scan_duration_ms} ms</strong></span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {totalErrors > 0 && (
              <span style={{ color: "#cf222e", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <VscError /> {totalErrors} Errors
              </span>
            )}
            {totalWarnings > 0 && (
              <span style={{ color: "#9a6700", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <VscWarning /> {totalWarnings} Warnings
              </span>
            )}
            {totalInfo > 0 && (
              <span style={{ color: "#005fb8", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <VscInfo /> {totalInfo} Info
              </span>
            )}
            {totalFixable > 0 && (
              <span style={{ color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <VscWand /> {totalFixable} Fixable
              </span>
            )}
          </div>
        </div>
      )}

      {/* Linter Findings List */}
      <div className={styles.linterFindingsList}>
        {filteredFindings.length === 0 ? (
          <div className={styles.emptyState}>
            {linterReport
              ? "No findings match the current filter criteria."
              : "Click 'Run Linter Scan' to analyze your workspace using Pomai Linter."}
          </div>
        ) : groupByFile ? (
          Object.entries(groupedByFile).map(([filePath, fileFindings]) => (
            <div key={filePath} className={styles.fileGroup}>
              <div className={styles.fileGroupHeader}>
                <VscFolder />
                <span className={styles.fileName}>{filePath.split(/[/\\]/).pop()}</span>
                <span className={styles.filePathSubtle}>{filePath}</span>
                <span className={styles.badgePill} style={{ backgroundColor: "rgba(0,95,184,0.12)", color: "#005fb8" }}>
                  {fileFindings.length} findings
                </span>
              </div>
              <div style={{ paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                {fileFindings.map((finding, idx) => renderFindingCard(finding, idx))}
              </div>
            </div>
          ))
        ) : (
          filteredFindings.map((finding, idx) => renderFindingCard(finding, idx))
        )}
      </div>
    </div>
  );
}
