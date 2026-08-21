/**
 * ProblemsPanel.tsx — Dedicated JetBrains RustRover Problems Tool Window.
 * Subtabs:
 * 1. File: Errors and warnings inside the currently active/opening file.
 * 2. Project Errors: All compiler errors and warnings across the whole project.
 * 3. Linter: Pomai Linter / Semgrep AST engine (Security, Panic Safety, Unsafe Audits & Quality).
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscError,
  VscWarning,
  VscInfo,
  VscChevronRight,
  VscChevronDown,
  VscEllipsis,
  VscChromeMinimize,
  VscEye,
  VscLightbulb,
  VscListTree,
  VscPlay,
  VscRefresh,
  VscCopy,
  VscCheck,
  VscTools
} from "react-icons/vsc";
import { CargoDiagnostic, WorkspaceDiagnostics } from "../../extensions/builtin/rust/CargoProvider";
import { useClippy } from "../../hooks/useClippy";
import styles from "./ProblemsPanel.module.css";

export interface LinterFinding {
  check_id: string;
  path: string;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO" | string;
  code_snippet?: string;
}

export interface LinterReport {
  success: boolean;
  findings: LinterFinding[];
  scanned_files_count: usize;
  scan_duration_ms: number;
  engine: string;
}

type usize = number;

interface ProblemsPanelProps {
  activeFile?: string;
  workspaceRoot?: string;
  workspaceDiagnostics?: WorkspaceDiagnostics | null;
  diagnostics?: CargoDiagnostic[];
  lspDiagnostics?: Record<string, import("../../ipc/lsp").LspDiagnostic[]>;
  onNavigateToProblem?: (filePath: string, line: number, col: number) => void;
  onClose?: () => void;
  onOpenFile?: (filePath: string) => void;
  onReloadFile?: (filePath: string) => void;
}

export function ProblemsPanel({
  activeFile,
  workspaceRoot,
  workspaceDiagnostics,
  diagnostics = [],
  lspDiagnostics = {},
  onNavigateToProblem,
  onClose,
  onOpenFile,
  onReloadFile,
}: ProblemsPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"file" | "project" | "linter" | "clippy">("file");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [groupByFile, setGroupByFile] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  // ── Linter State (Pomai Linter / Semgrep Core) ──
  const [isScanning, setIsScanning] = useState(false);
  const [linterReport, setLinterReport] = useState<LinterReport | null>(null);
  const [linterPreset, setLinterPreset] = useState<string>("auto");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "ERROR" | "WARNING" | "INFO">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedReport, setCopiedReport] = useState(false);

  // ── Clippy State ──
  const {
    diagnostics: clippyDiagnostics,
    loading: clippyLoading,
    error: clippyError,
    progress: clippyProgress,
    fixResult: clippyFixResult,
    runDiagnostics: runClippyDiagnostics,
    applyWorkspaceFix: applyClippyWorkspaceFix,
    applySingleFix: applyClippySingleFix,
    clearDiagnostics: clearClippyDiagnostics,
  } = useClippy();

  // Normalize path helper
  const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();

  // ── 1. File Diagnostics (Filtered to active file) ──
  const fileDiagnostics = useMemo(() => {
    if (!activeFile || activeFile === "Welcome") return [];
    const normActive = normalize(activeFile);

    const matched = diagnostics.filter((d) => {
      const normD = normalize(d.file_path);
      return normActive.endsWith(normD) || normD.endsWith(normActive);
    });

    if (matched.length > 0) return matched;

    if (workspaceDiagnostics && workspaceDiagnostics.files) {
      for (const [fPath, summary] of Object.entries(workspaceDiagnostics.files)) {
        const normF = normalize(fPath);
        if (normActive.endsWith(normF) || normF.endsWith(normActive)) {
          return summary.diagnostics || [];
        }
      }
    }

    // Include LSP diagnostics for the active file
    const lspDiags = lspDiagnostics[normActive] || lspDiagnostics[activeFile] || [];
    if (lspDiags.length > 0) {
      return lspDiags.map((d) => ({
        file_path: activeFile,
        line: d.range.start.line,
        column: d.range.start.character,
        message: d.message,
        severity: d.severity.toLowerCase() as "error" | "warning" | "info",
        code: d.code || undefined,
        rendered: d.message,
      }));
    }

    return [];
  }, [activeFile, diagnostics, workspaceDiagnostics, lspDiagnostics]);

  // ── 2. Project Diagnostics (Grouped by file) ──
  const projectGroups = useMemo(() => {
    const groups: Record<string, CargoDiagnostic[]> = {};

    for (const d of diagnostics) {
      const path = d.file_path || "Workspace";
      if (!groups[path]) groups[path] = [];
      groups[path].push(d);
    }

    if (workspaceDiagnostics && workspaceDiagnostics.files) {
      for (const [filePath, summary] of Object.entries(workspaceDiagnostics.files)) {
        if (!groups[filePath]) groups[filePath] = [];
        for (const d of summary.diagnostics || []) {
          if (!groups[filePath].some((existing) => existing.line === d.line && existing.column === d.column && existing.message === d.message)) {
            groups[filePath].push(d);
          }
        }
      }
    }

    // Include LSP diagnostics in project view
    for (const [filePath, lspDiags] of Object.entries(lspDiagnostics)) {
      if (!groups[filePath]) groups[filePath] = [];
      for (const d of lspDiags) {
        const cargoDiag: CargoDiagnostic = {
          file_path: filePath,
          line: d.range.start.line,
          column: d.range.start.character,
          message: d.message,
          severity: d.severity.toLowerCase() as "error" | "warning" | "info",
          code: d.code || undefined,
          rendered: d.message,
        };
        if (!groups[filePath].some((existing) => existing.line === cargoDiag.line && existing.column === cargoDiag.column && existing.message === cargoDiag.message)) {
          groups[filePath].push(cargoDiag);
        }
      }
    }

    return groups;
  }, [diagnostics, workspaceDiagnostics, lspDiagnostics]);

  const totalProjectErrors = useMemo(() => {
    let count = 0;
    for (const diags of Object.values(projectGroups)) {
      count += diags.filter((d) => d.severity === "error").length;
    }
    return count;
  }, [projectGroups]);

  const totalProjectWarnings = useMemo(() => {
    let count = 0;
    for (const diags of Object.values(projectGroups)) {
      count += diags.filter((d) => d.severity === "warning").length;
    }
    return count;
  }, [projectGroups]);

  // ── 3. Run Pomai Linter Scan ──
  const runLinterScan = useCallback(async () => {
    setIsScanning(true);
    const rootPath = workspaceRoot || ".";

    if (window.__TAURI_INTERNALS__) {
      try {
        const report = await invoke<LinterReport>("scan_workspace_linter", {
          workspaceRoot: rootPath,
          rulesConfig: linterPreset === "auto" ? null : linterPreset,
        });
        setLinterReport(report);
      } catch (err) {
        console.error("Linter invocation failed:", err);
      } finally {
        setIsScanning(false);
      }
    } else {
      // Browser preview fallback mock
      setTimeout(() => {
        setLinterReport({
          success: true,
          scanned_files_count: 38,
          scan_duration_ms: 142,
          engine: "Pomai-Linter Native Engine",
          findings: [
            {
              check_id: "pomai.rust.safety.avoid-unwrap",
              path: "src-tauri/src/debugger/debugger_embed.rs",
              start_line: 114,
              start_col: 18,
              end_line: 114,
              end_col: 55,
              message: "Potential panic risk: use `?` operator or `expect()` with explanatory message instead of `.unwrap()`",
              severity: "WARNING",
              code_snippet: ".duration_since(std::time::UNIX_EPOCH).unwrap_or_default()",
            },
            {
              check_id: "pomai.rust.safety.unsafe-block-audit",
              path: "src-tauri/src/debugger/debugger_embed.rs",
              start_line: 85,
              start_col: 13,
              end_line: 85,
              end_col: 48,
              message: "Unsafe block detected: requires explicit safety invariant comment",
              severity: "INFO",
              code_snippet: "use std::os::unix::fs::PermissionsExt;",
            },
          ],
        });
        setIsScanning(false);
      }, 300);
    }
  }, [workspaceRoot, linterPreset]);

  // Automatically trigger initial scan when Linter tab is selected for first time
  useEffect(() => {
    if (activeSubTab === "linter" && !linterReport && !isScanning) {
      runLinterScan();
    }
  }, [activeSubTab, linterReport, isScanning, runLinterScan]);

  // Filtered Linter Findings
  const filteredFindings = useMemo(() => {
    if (!linterReport || !linterReport.findings) return [];

    return linterReport.findings.filter((f) => {
      // Severity filter
      if (severityFilter !== "ALL" && f.severity.toUpperCase() !== severityFilter) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          f.check_id.toLowerCase().includes(query) ||
          f.message.toLowerCase().includes(query) ||
          f.path.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [linterReport, severityFilter, searchQuery]);

  const resolveFilePath = (filePath: string): string => {
    if (!filePath) return "";
    const normalized = filePath.replace(/\\/g, "/");
    if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) {
      return normalized;
    }
    if (workspaceRoot) {
      const rootNormalized = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
      const cleanRelative = normalized.replace(/^\.\//, "").replace(/^\//, "");
      return `${rootNormalized}/${cleanRelative}`;
    }
    return normalized;
  };

  const handleProblemClick = (filePath: string, line: number, col: number) => {
    const fullPath = resolveFilePath(filePath);
    // First open the file if it's not already open
    if (onOpenFile) {
      onOpenFile(fullPath);
    }
    // Then navigate to the specific line/column
    if (onNavigateToProblem) {
      onNavigateToProblem(fullPath, line, col);
    }
  };

  const handleCopyReport = () => {
    if (linterReport) {
      navigator.clipboard.writeText(JSON.stringify(linterReport, null, 2));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const linterErrorCount = useMemo(() => {
    return linterReport?.findings.filter((f) => f.severity.toUpperCase() === "ERROR").length || 0;
  }, [linterReport]);

  const linterWarnCount = useMemo(() => {
    return linterReport?.findings.filter((f) => f.severity.toUpperCase() === "WARNING").length || 0;
  }, [linterReport]);

  const linterInfoCount = useMemo(() => {
    return linterReport?.findings.filter((f) => f.severity.toUpperCase() === "INFO").length || 0;
  }, [linterReport]);

  return (
    <div className={styles.problemsContainer}>
      {/* ── Header Subtabs Bar ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Problems</span>
          <div className={styles.subTabsList}>
            <button
              className={`${styles.subTab} ${activeSubTab === "file" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("file")}
            >
              <span>File</span>
              {fileDiagnostics.length > 0 && (
                <span className={styles.tabBadge}>{fileDiagnostics.length}</span>
              )}
            </button>

            <button
              className={`${styles.subTab} ${activeSubTab === "project" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("project")}
            >
              <span>Project Errors</span>
              {totalProjectErrors + totalProjectWarnings > 0 && (
                <span className={styles.tabBadge}>
                  {totalProjectErrors + totalProjectWarnings}
                </span>
              )}
            </button>

            <button
              className={`${styles.subTab} ${activeSubTab === "linter" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("linter")}
              title="Pomai Linter (Semgrep AST Static Analysis Engine)"
            >
              <span>Linter</span>
              {linterReport && linterReport.findings.length > 0 && (
                <span className={styles.tabBadge} style={{ backgroundColor: "#9a6700" }}>
                  {linterReport.findings.length}
                </span>
              )}
            </button>

            <button
              className={`${styles.subTab} ${activeSubTab === "clippy" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("clippy")}
              title="Clippy Linter (Rust Idioms & Best Practices)"
            >
              <span>Clippy</span>
              {clippyDiagnostics.length > 0 && (
                <span className={styles.tabBadge} style={{ backgroundColor: "#ce422b" }}>
                  {clippyDiagnostics.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.iconBtn} title="More Options">
            <VscEllipsis size={16} />
          </button>
          {onClose && (
            <button className={styles.iconBtn} title="Minimize" onClick={onClose}>
              <VscChromeMinimize size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Panel Body ── */}
      <div className={styles.panelBody}>
        {/* ── Left Action Bar ── */}
        <div className={styles.leftActionBar}>
          <button 
            className={`${styles.actionToolBtn} ${previewMode ? styles.actionToolBtnActive : ''}`} 
            title="Preview Problem Location"
            onClick={() => setPreviewMode(!previewMode)}
          >
            <VscEye />
          </button>
          <button 
            className={styles.actionToolBtn} 
            title="Suggested Fixes (Quick Fix)"
            onClick={() => {
              // Trigger quick fix for the first error in the current view
              if (activeSubTab === "file" && fileDiagnostics.length > 0 && onNavigateToProblem) {
                const firstError = fileDiagnostics[0];
                handleProblemClick(firstError.file_path || activeFile || "", firstError.line, firstError.column);
              }
            }}
          >
            <VscLightbulb />
          </button>
          <button 
            className={`${styles.actionToolBtn} ${groupByFile ? styles.actionToolBtnActive : ''}`} 
            title="Group By File"
            onClick={() => setGroupByFile(!groupByFile)}
          >
            <VscListTree />
          </button>
        </div>

        {/* ── Content View ── */}
        <div className={styles.contentArea}>
          {/* ── 1. Active File Problems ── */}
          {activeSubTab === "file" && (
            <div>
              {!activeFile || activeFile === "Welcome" ? (
                <div className={styles.emptyState}>Open file in editor to see problems</div>
              ) : fileDiagnostics.length === 0 ? (
                <div className={styles.emptyState}>No problems found in current file</div>
              ) : (
                fileDiagnostics.map((diag, idx) => {
                  return (
                    <div
                      key={idx}
                      className={styles.problemRow}
                      onClick={() => handleProblemClick(diag.file_path || activeFile, diag.line, diag.column)}
                      title={diag.rendered || diag.message}
                    >
                      {diag.severity === "error" ? (
                        <VscError className={styles.problemIconError} />
                      ) : diag.severity === "warning" ? (
                        <VscWarning className={styles.problemIconWarning} />
                      ) : (
                        <VscInfo className={styles.problemIconInfo} />
                      )}
                      <div className={styles.problemMessage}>
                        <span>{diag.message}</span>
                        {diag.code && <span className={styles.problemCode}>[{diag.code}]</span>}
                      </div>
                      <div className={styles.problemLocation}>
                        line {diag.line + 1}, col {diag.column + 1}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── 2. Project Errors ── */}
          {activeSubTab === "project" && (
            <div>
              {Object.keys(projectGroups).length === 0 || (totalProjectErrors === 0 && totalProjectWarnings === 0) ? (
                <div className={styles.emptyState}>No errors or warnings found in project</div>
              ) : (
                Object.entries(projectGroups).map(([filePath, fileDiags]) => {
                  if (fileDiags.length === 0) return null;
                  const isCollapsed = collapsedFiles.has(filePath);
                  const fileName = filePath.split(/[/\\]/).pop() || filePath;
                  const errors = fileDiags.filter((d) => d.severity === "error").length;
                  const warnings = fileDiags.filter((d) => d.severity === "warning").length;

                  return (
                    <div key={filePath} className={styles.fileGroup}>
                      <div
                        className={styles.fileGroupHeader}
                        onClick={() => toggleFileCollapse(filePath)}
                      >
                        {isCollapsed ? <VscChevronRight /> : <VscChevronDown />}
                        <span className={styles.fileName}>{fileName}</span>
                        <span className={styles.filePathSubtle}>{filePath}</span>

                        {errors > 0 && (
                          <span className={`${styles.badgePill} ${styles.badgePillError}`}>
                            {errors} {errors === 1 ? "error" : "errors"}
                          </span>
                        )}
                        {warnings > 0 && (
                          <span className={`${styles.badgePill} ${styles.badgePillWarning}`}>
                            {warnings} {warnings === 1 ? "warning" : "warnings"}
                          </span>
                        )}
                      </div>

                      {!isCollapsed &&
                        fileDiags.map((diag, i) => (
                          <div
                            key={`${filePath}-${diag.line}-${diag.column}-${i}`}
                            className={styles.problemRow}
                            onClick={() => handleProblemClick(diag.file_path || filePath, diag.line, diag.column)}
                            title={diag.rendered || diag.message}
                          >
                            {diag.severity === "error" ? (
                              <VscError className={styles.problemIconError} />
                            ) : diag.severity === "warning" ? (
                              <VscWarning className={styles.problemIconWarning} />
                            ) : (
                              <VscInfo className={styles.problemIconInfo} />
                            )}
                            <div className={styles.problemMessage}>
                              <span>{diag.message}</span>
                              {diag.code && <span className={styles.problemCode}>[{diag.code}]</span>}
                            </div>
                            <div className={styles.problemLocation}>
                              line {diag.line + 1}, col {diag.column + 1}
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── 3. Pomai Linter / Semgrep Engine View ── */}
          {activeSubTab === "linter" && (
            <div className={styles.linterContainer}>
              {/* Linter Toolbar */}
              <div className={styles.linterToolbar}>
                <div className={styles.linterToolbarLeft}>
                  <button
                    className={styles.runScanBtn}
                    onClick={runLinterScan}
                    disabled={isScanning}
                    title="Execute Pomai Linter workspace scan"
                  >
                    {isScanning ? <VscRefresh className="spin" /> : <VscPlay />}
                    <span>{isScanning ? "Scanning..." : "Run Linter Scan"}</span>
                  </button>

                  <select
                    className={styles.presetSelect}
                    value={linterPreset}
                    onChange={(e) => setLinterPreset(e.target.value)}
                    title="Select ruleset preset"
                  >
                    <option value="auto">Auto (Full AST Scan)</option>
                    <option value="security">Security & Injection</option>
                    <option value="reliability">Panic & Unhandled Errors</option>
                    <option value="unsafe">Unsafe Code Audits</option>
                    <option value="quality">Code Cleanliness & TODOs</option>
                  </select>

                  <div className={styles.filterPillsGroup}>
                    <button
                      className={`${styles.filterPillBtn} ${severityFilter === "ALL" ? styles.filterPillBtnActive : ""}`}
                      onClick={() => setSeverityFilter("ALL")}
                    >
                      All ({linterReport?.findings.length || 0})
                    </button>
                    <button
                      className={`${styles.filterPillBtn} ${severityFilter === "ERROR" ? styles.filterPillBtnActive : ""}`}
                      onClick={() => setSeverityFilter("ERROR")}
                    >
                      Errors ({linterErrorCount})
                    </button>
                    <button
                      className={`${styles.filterPillBtn} ${severityFilter === "WARNING" ? styles.filterPillBtnActive : ""}`}
                      onClick={() => setSeverityFilter("WARNING")}
                    >
                      Warnings ({linterWarnCount})
                    </button>
                    <button
                      className={`${styles.filterPillBtn} ${severityFilter === "INFO" ? styles.filterPillBtnActive : ""}`}
                      onClick={() => setSeverityFilter("INFO")}
                    >
                      Info ({linterInfoCount})
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="text"
                    className={styles.linterSearchInput}
                    placeholder="Filter findings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {linterReport && (
                    <button
                      className={styles.iconBtn}
                      onClick={handleCopyReport}
                      title="Copy SARIF / JSON report"
                    >
                      {copiedReport ? <VscCheck color="#1a7f37" /> : <VscCopy />}
                    </button>
                  )}
                </div>
              </div>

              {/* Linter Metrics Banner */}
              {linterReport && (
                <div className={styles.linterMetricsBanner}>
                  <span className={styles.metricsBadge}>
                    Engine: <strong>{linterReport.engine}</strong>
                  </span>
                  <span>
                    Scanned <strong>{linterReport.scanned_files_count}</strong> files in{" "}
                    <strong>{linterReport.scan_duration_ms}ms</strong>
                  </span>
                  <span>
                    Total findings: <strong>{linterReport.findings.length}</strong>
                  </span>
                </div>
              )}

              {/* Findings Stream */}
              <div className={styles.linterFindingsList}>
                {filteredFindings.length === 0 ? (
                  <div className={styles.emptyState}>
                    {isScanning
                      ? "Analyzing workspace AST & pattern rules..."
                      : "No linter findings matching current filters."}
                  </div>
                ) : (
                  filteredFindings.map((finding, idx) => {
                    const isErr = finding.severity.toUpperCase() === "ERROR";
                    const isWarn = finding.severity.toUpperCase() === "WARNING";
                    const sevClass = isErr
                      ? styles.severityError
                      : isWarn
                      ? styles.severityWarning
                      : styles.severityInfo;

                    return (
                      <div
                        key={idx}
                        className={styles.findingCard}
                        onClick={() =>
                          handleProblemClick(
                            finding.path,
                            finding.start_line - 1,
                            finding.start_col - 1
                          )
                        }
                      >
                        <div className={styles.findingCardHeader}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className={`${styles.findingSeverityBadge} ${sevClass}`}>
                              {finding.severity}
                            </span>
                            <span className={styles.findingCheckId}>{finding.check_id}</span>
                          </div>
                          <span className={styles.findingLocation}>
                            {finding.path}:{finding.start_line}:{finding.start_col}
                          </span>
                        </div>

                        <div className={styles.findingMessage}>{finding.message}</div>

                        {finding.code_snippet && (
                          <div className={styles.findingSnippet}>
                            {finding.code_snippet}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── 4. Clippy Linter View ── */}
          {activeSubTab === "clippy" && (
            <div className={styles.linterContainer}>
              {/* Clippy Toolbar */}
              <div className={styles.linterToolbar}>
                <div className={styles.linterToolbarLeft}>
                  <button
                    className={styles.runScanBtn}
                    onClick={() => workspaceRoot && runClippyDiagnostics(workspaceRoot)}
                    disabled={clippyLoading || !workspaceRoot}
                    title="Run Clippy diagnostics"
                  >
                    {clippyLoading ? <VscRefresh className="spin" /> : <VscPlay />}
                    <span>{clippyLoading ? "Running Clippy..." : "Run Clippy"}</span>
                  </button>

                  <button
                    className={styles.runScanBtn}
                    onClick={() => workspaceRoot && applyClippyWorkspaceFix(workspaceRoot, true, (files) => {
                      // Reload modified files
                      files.forEach(file => onReloadFile?.(file));
                    })}
                    disabled={clippyLoading || !workspaceRoot}
                    title="Auto-fix all machine-applicable Clippy warnings"
                  >
                    <VscTools />
                    <span>Auto-Fix All</span>
                  </button>

                  {clippyProgress && (
                    <div className={styles.clippyProgress}>
                      <span>{clippyProgress.message}</span>
                      {clippyProgress.total_files && (
                        <span>({clippyProgress.files_processed}/{clippyProgress.total_files})</span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    className={styles.iconBtn}
                    onClick={clearClippyDiagnostics}
                    title="Clear Clippy diagnostics"
                  >
                    <VscRefresh />
                  </button>
                </div>
              </div>

              {/* Clippy Fix Result Banner */}
              {clippyFixResult && (
                <div className={styles.linterMetricsBanner} style={{ backgroundColor: "#e8f4e8" }}>
                  <span className={styles.metricsBadge} style={{ color: "#1a7f37" }}>
                    ✓ Success
                  </span>
                  <span>
                    Applied <strong>{clippyFixResult.fixes_applied}</strong> fixes across{" "}
                    <strong>{clippyFixResult.files_modified.length}</strong> files
                  </span>
                </div>
              )}

              {/* Clippy Error */}
              {clippyError && (
                <div className={styles.linterMetricsBanner} style={{ backgroundColor: "#ffe8e8" }}>
                  <span className={styles.metricsBadge} style={{ color: "#ce422b" }}>
                    ✗ Error
                  </span>
                  <span>{clippyError}</span>
                </div>
              )}

              {/* Clippy Diagnostics List */}
              <div className={styles.linterFindingsList}>
                {clippyDiagnostics.length === 0 ? (
                  <div className={styles.emptyState}>
                    {clippyLoading
                      ? "Running Clippy diagnostics..."
                      : workspaceRoot
                      ? "No Clippy warnings found. Click 'Run Clippy' to scan the workspace."
                      : "No workspace open."}
                  </div>
                ) : (
                  clippyDiagnostics.map((diag, idx) => {
                    const isMachineApplicable = diag.is_machine_applicable;
                    const severityClass = diag.severity === "error"
                      ? styles.severityError
                      : diag.severity === "warning"
                      ? styles.severityWarning
                      : styles.severityInfo;

                    return (
                      <div
                        key={idx}
                        className={styles.findingCard}
                        onClick={() =>
                          handleProblemClick(
                            diag.file_path,
                            diag.range.start_line,
                            diag.range.start_character
                          )
                        }
                      >
                        <div className={styles.findingCardHeader}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className={`${styles.findingSeverityBadge} ${severityClass}`}>
                              {diag.severity}
                            </span>
                            <span className={styles.findingCheckId}>{diag.lint_name}</span>
                            {isMachineApplicable && (
                              <span className={styles.preferredBadge} style={{ fontSize: "11px" }}>
                                ✓ Auto-fix
                              </span>
                            )}
                          </div>
                          <span className={styles.findingLocation}>
                            {diag.file_path.split("/").pop()}:{diag.range.start_line + 1}
                          </span>
                        </div>

                        <div className={styles.findingMessage}>{diag.message}</div>

                        {isMachineApplicable && diag.suggestions.length > 0 && (
                          <button
                            className={styles.applyFixBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              applyClippySingleFix(diag.file_path, diag.suggestions[0], (file) => {
                                onReloadFile?.(file);
                              });
                            }}
                          >
                            Apply Fix
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProblemsPanel;
