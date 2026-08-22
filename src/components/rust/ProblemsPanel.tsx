/**
 * ProblemsPanel.tsx — JetBrains-style Problems Tool Window orchestrator.
 * Delegates views to modular subcomponents:
 * 1. FileProblemsView: Active file diagnostics.
 * 2. ProjectErrorsView: Cargo / workspace compiler diagnostics.
 * 3. LinterFindingsView: Pomai Linter Semgrep engine findings.
 * 4. ClippyDiagnosticsView: Cargo Clippy diagnostics.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CargoDiagnostic } from "../../extensions/builtin/rust/CargoProvider";
import { useClippy } from "../../hooks/useClippy";
import { LinterFinding, LinterReport, ProblemsPanelProps } from "./problems/types";
import { ProblemsHeader } from "./problems/ProblemsHeader";
import { FileProblemsView } from "./problems/FileProblemsView";
import { ProjectErrorsView } from "./problems/ProjectErrorsView";
import { LinterFindingsView } from "./problems/LinterFindingsView";
import { ClippyDiagnosticsView } from "./problems/ClippyDiagnosticsView";
import styles from "./ProblemsPanel.module.css";

export type { LinterFinding, LinterReport, ProblemsPanelProps };

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
  const [selectedProblemKey, setSelectedProblemKey] = useState<string | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [activeFixFindingKey, setActiveFixFindingKey] = useState<string | null>(null);
  const [fixStatusMap, setFixStatusMap] = useState<Record<string, string>>({});

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
  } = useClippy();

  const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();

  // ── 1. File Diagnostics ──
  const fileDiagnostics = useMemo(() => {
    if (!activeFile || activeFile === "Welcome") return [];
    const normActive = normalize(activeFile);

    const matched = diagnostics.filter((d) => {
      const normD = normalize(d.file_path);
      return normActive.endsWith(normD) || normD.endsWith(normActive);
    });

    if (matched.length > 0) return matched;

    const matchedLsp: CargoDiagnostic[] = [];
    Object.entries(lspDiagnostics).forEach(([filePath, list]) => {
      const normD = normalize(filePath);
      if (normActive.endsWith(normD) || normD.endsWith(normActive)) {
        list.forEach((d) => {
          matchedLsp.push({
            file_path: filePath,
            line: d.range.start.line,
            column: d.range.start.character,
            severity: (d.severity as unknown as number) === 1 ? "error" : (d.severity as unknown as number) === 2 ? "warning" : "info",
            code: d.code ? String(d.code) : undefined,
            rendered: d.message,
            message: d.message,
          });
        });
      }
    });

    return matchedLsp;
  }, [activeFile, diagnostics, lspDiagnostics]);

  // ── 2. Project Errors ──
  const projectGroups = useMemo(() => {
    const map: Record<string, CargoDiagnostic[]> = {};
    if (workspaceDiagnostics && workspaceDiagnostics.files) {
      Object.entries(workspaceDiagnostics.files).forEach(([file, summary]) => {
        map[file] = summary.diagnostics;
      });
    }

    if (Object.keys(map).length === 0 && diagnostics.length > 0) {
      diagnostics.forEach((d) => {
        const key = d.file_path || "Project";
        if (!map[key]) map[key] = [];
        map[key].push(d);
      });
    }

    if (Object.keys(map).length === 0 && Object.keys(lspDiagnostics).length > 0) {
      Object.entries(lspDiagnostics).forEach(([filePath, lspList]) => {
        map[filePath] = lspList.map((d) => ({
          file_path: filePath,
          line: d.range.start.line,
          column: d.range.start.character,
          severity: (d.severity as unknown as number) === 1 ? "error" : (d.severity as unknown as number) === 2 ? "warning" : "info",
          code: d.code ? String(d.code) : undefined,
          rendered: d.message,
          message: d.message,
        }));
      });
    }

    return map;
  }, [workspaceDiagnostics, diagnostics, lspDiagnostics]);

  const flatProjectDiagnostics = useMemo(() => {
    const list: Array<{ filePath: string; diag: CargoDiagnostic }> = [];
    Object.entries(projectGroups).forEach(([filePath, diags]) => {
      diags.forEach((diag) => {
        list.push({ filePath, diag });
      });
    });
    return list;
  }, [projectGroups]);

  const totalProjectErrors = useMemo(() => {
    return flatProjectDiagnostics.filter((item) => item.diag.severity === "error").length;
  }, [flatProjectDiagnostics]);

  const totalProjectWarnings = useMemo(() => {
    return flatProjectDiagnostics.filter((item) => item.diag.severity === "warning").length;
  }, [flatProjectDiagnostics]);

  const fileErrorCount = useMemo(
    () => fileDiagnostics.filter((d) => d.severity === "error").length,
    [fileDiagnostics]
  );
  const fileWarningCount = useMemo(
    () => fileDiagnostics.filter((d) => d.severity === "warning").length,
    [fileDiagnostics]
  );

  // ── 3. Pomai Linter Scan ──
  const runLinterScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const rootPath = workspaceRoot || ".";
      const presetArg = linterPreset === "auto" ? null : linterPreset;
      const result: LinterReport = await invoke("scan_workspace_linter", {
        workspaceRoot: rootPath,
        rulesConfig: presetArg,
      });
      setLinterReport(result);
    } catch (err) {
      console.error("Failed to run Pomai Linter scan:", err);
    } finally {
      setIsScanning(false);
    }
  }, [workspaceRoot, linterPreset]);

  useEffect(() => {
    runLinterScan();
  }, [runLinterScan]);

  const handleCopyReport = () => {
    if (linterReport) {
      navigator.clipboard.writeText(JSON.stringify(linterReport, null, 2));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const filteredFindings = useMemo(() => {
    if (!linterReport || !linterReport.findings) return [];
    return linterReport.findings.filter((finding) => {
      if (severityFilter !== "ALL" && finding.severity.toUpperCase() !== severityFilter) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          finding.check_id.toLowerCase().includes(q) ||
          finding.message.toLowerCase().includes(q) ||
          finding.path.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [linterReport, severityFilter, searchQuery]);

  const linterErrorCount = useMemo(() => {
    return linterReport?.findings.filter((f) => f.severity.toUpperCase() === "ERROR").length || 0;
  }, [linterReport]);

  const handleProblemClick = (filePath: string, line: number, column: number, rowKey: string) => {
    setSelectedProblemKey(rowKey);
    if (onNavigateToProblem) {
      onNavigateToProblem(filePath, line, column);
    }
  };

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleRunClippy = () => {
    runClippyDiagnostics(workspaceRoot || ".");
  };

  const handleApplyClippyWorkspaceFix = () => {
    applyClippyWorkspaceFix(workspaceRoot || ".");
  };

  const handleApplyClippySingleFix = (filePath: string, suggestion: any) => {
    applyClippySingleFix(filePath, suggestion, (file) => {
      onReloadFile?.(file);
    });
  };

  return (
    <div className={styles.container} onClick={() => setIsMoreMenuOpen(false)}>
      <ProblemsHeader
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        fileErrorCount={fileErrorCount}
        fileWarningCount={fileWarningCount}
        totalProjectErrors={totalProjectErrors}
        totalProjectWarnings={totalProjectWarnings}
        linterCount={filteredFindings.length}
        linterErrorCount={linterErrorCount}
        clippyCount={clippyDiagnostics.length}
        groupByFile={groupByFile}
        setGroupByFile={setGroupByFile}
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        isMoreMenuOpen={isMoreMenuOpen}
        setIsMoreMenuOpen={setIsMoreMenuOpen}
        onClose={onClose}
      />

      <div className={styles.body}>
        {activeSubTab === "file" && (
          <FileProblemsView
            activeFile={activeFile}
            fileDiagnostics={fileDiagnostics}
            selectedProblemKey={selectedProblemKey}
            activeFixFindingKey={activeFixFindingKey}
            setActiveFixFindingKey={setActiveFixFindingKey}
            fixStatusMap={fixStatusMap}
            setFixStatusMap={setFixStatusMap}
            handleProblemClick={handleProblemClick}
            workspaceRoot={workspaceRoot}
            onReloadFile={onReloadFile}
            onOpenFile={onOpenFile}
          />
        )}

        {activeSubTab === "project" && (
          <ProjectErrorsView
            projectGroups={projectGroups}
            flatProjectDiagnostics={flatProjectDiagnostics}
            totalProjectErrors={totalProjectErrors}
            totalProjectWarnings={totalProjectWarnings}
            groupByFile={groupByFile}
            collapsedFiles={collapsedFiles}
            toggleFileCollapse={toggleFileCollapse}
            selectedProblemKey={selectedProblemKey}
            activeFixFindingKey={activeFixFindingKey}
            setActiveFixFindingKey={setActiveFixFindingKey}
            fixStatusMap={fixStatusMap}
            setFixStatusMap={setFixStatusMap}
            handleProblemClick={handleProblemClick}
            workspaceRoot={workspaceRoot}
            onReloadFile={onReloadFile}
            onOpenFile={onOpenFile}
          />
        )}

        {activeSubTab === "linter" && (
          <LinterFindingsView
            isScanning={isScanning}
            runLinterScan={runLinterScan}
            linterPreset={linterPreset}
            setLinterPreset={setLinterPreset}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            copiedReport={copiedReport}
            handleCopyReport={handleCopyReport}
            filteredFindings={filteredFindings}
            linterReport={linterReport}
            selectedProblemKey={selectedProblemKey}
            activeFixFindingKey={activeFixFindingKey}
            setActiveFixFindingKey={setActiveFixFindingKey}
            fixStatusMap={fixStatusMap}
            setFixStatusMap={setFixStatusMap}
            handleProblemClick={handleProblemClick}
            workspaceRoot={workspaceRoot}
            onReloadFile={onReloadFile}
            onOpenFile={onOpenFile}
          />
        )}

        {activeSubTab === "clippy" && (
          <ClippyDiagnosticsView
            clippyLoading={clippyLoading}
            clippyProgress={clippyProgress}
            runClippyDiagnostics={handleRunClippy}
            applyClippyWorkspaceFix={handleApplyClippyWorkspaceFix}
            applyClippySingleFix={handleApplyClippySingleFix}
            clippyFixResult={clippyFixResult}
            clippyError={clippyError}
            clippyDiagnostics={clippyDiagnostics}
            selectedProblemKey={selectedProblemKey}
            handleProblemClick={handleProblemClick}
          />
        )}
      </div>
    </div>
  );
}
