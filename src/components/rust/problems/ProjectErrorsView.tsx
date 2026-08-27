/**
 * ProjectErrorsView.tsx — Tab 2 component rendering all workspace errors and warnings
 */

import {
  VscError,
  VscWarning,
  VscInfo,
  VscChevronRight,
  VscChevronDown,
  VscLightbulb
} from "react-icons/vsc";
import { CargoDiagnostic } from "../../../extensions/builtin/rust/CargoProvider";
import { QuickFixBox } from "./QuickFixBox";
import { applyProjectErrorFix, getProjectErrorQuickFixes } from "./quickFixHelpers";
import styles from "../ProblemsPanel.module.css";

interface ProjectErrorsViewProps {
  projectGroups: Record<string, CargoDiagnostic[]>;
  flatProjectDiagnostics: Array<{ filePath: string; diag: CargoDiagnostic }>;
  totalProjectErrors: number;
  totalProjectWarnings: number;
  groupByFile: boolean;
  collapsedFiles: Set<string>;
  toggleFileCollapse: (filePath: string) => void;
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

export function ProjectErrorsView({
  projectGroups,
  flatProjectDiagnostics,
  totalProjectErrors,
  totalProjectWarnings,
  groupByFile,
  collapsedFiles,
  toggleFileCollapse,
  selectedProblemKey,
  activeFixFindingKey,
  setActiveFixFindingKey,
  fixStatusMap,
  setFixStatusMap,
  handleProblemClick,
  workspaceRoot,
  onReloadFile,
  onOpenFile,
}: ProjectErrorsViewProps) {
  if (Object.keys(projectGroups).length === 0 || (totalProjectErrors === 0 && totalProjectWarnings === 0)) {
    return <div className={styles.emptyState}>No errors or warnings found in project</div>;
  }

  if (!groupByFile) {
    return (
      <div className={styles.contentArea}>
        {flatProjectDiagnostics.map(({ filePath, diag }, i) => {
          const rowKey = `flat-${i}-${filePath}-${diag.line}-${diag.column}`;
          const isSelected = selectedProblemKey === rowKey;
          const isFixActive = activeFixFindingKey === rowKey;
          const quickFixes = getProjectErrorQuickFixes(diag);

          const quickFixOptions = quickFixes.map((fix) => ({
            title: fix.title,
            onApply: () =>
              applyProjectErrorFix(
                diag.file_path || filePath,
                diag.line + 1,
                fix.type,
                diag.message,
                rowKey,
                workspaceRoot,
                onReloadFile,
                onOpenFile,
                setFixStatusMap
              ),
          }));

          return (
            <div
              key={rowKey}
              className={`${styles.problemRow} ${isSelected ? styles.problemRowActive : ''}`}
              onClick={() => handleProblemClick(diag.file_path || filePath, diag.line, diag.column, rowKey)}
              title={diag.rendered || diag.message}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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

                <button
                  className={`${styles.cardActionBtn} ${isFixActive ? styles.cardActionBtnActive : ''}`}
                  title="Suggested Quick Fix"
                  style={{ marginLeft: 'auto', marginRight: '8px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFixFindingKey(isFixActive ? null : rowKey);
                  }}
                >
                  <VscLightbulb size={14} />
                </button>

                <div className={styles.problemLocation}>
                  {filePath.split(/[/\\]/).pop()}:{diag.line + 1}
                </div>
              </div>

              {isFixActive && (
                <QuickFixBox
                  options={quickFixOptions}
                  statusText={fixStatusMap[rowKey]}
                  filePath={diag.file_path || filePath}
                  line={diag.line}
                  column={diag.column}
                  workspaceRoot={workspaceRoot}
                  onReloadFile={onReloadFile}
                  onOpenFile={onOpenFile}
                  rowKey={rowKey}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.contentArea}>
      {Object.entries(projectGroups).map(([filePath, fileDiags]) => {
        if (fileDiags.length === 0) return null;
        const isCollapsed = collapsedFiles.has(filePath);
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        const errors = fileDiags.filter((d) => d.severity === "error").length;
        const warnings = fileDiags.filter((d) => d.severity === "warning").length;

        return (
          <div key={filePath} className={styles.fileGroup}>
            <div className={styles.fileGroupHeader} onClick={() => toggleFileCollapse(filePath)}>
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
              fileDiags.map((diag, i) => {
                const rowKey = `grp-${filePath}-${diag.line}-${diag.column}-${i}`;
                const isSelected = selectedProblemKey === rowKey;
                const isFixActive = activeFixFindingKey === rowKey;
                const quickFixes = getProjectErrorQuickFixes(diag);

                const quickFixOptions = quickFixes.map((fix) => ({
                  title: fix.title,
                  onApply: () =>
                    applyProjectErrorFix(
                      diag.file_path || filePath,
                      diag.line + 1,
                      fix.type,
                      diag.message,
                      rowKey,
                      workspaceRoot,
                      onReloadFile,
                      onOpenFile,
                      setFixStatusMap
                    ),
                }));

                return (
                  <div
                    key={rowKey}
                    className={`${styles.problemRow} ${isSelected ? styles.problemRowActive : ''}`}
                    onClick={() => handleProblemClick(diag.file_path || filePath, diag.line, diag.column, rowKey)}
                    title={diag.rendered || diag.message}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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

                      <button
                        className={`${styles.cardActionBtn} ${isFixActive ? styles.cardActionBtnActive : ''}`}
                        title="Suggested Quick Fix"
                        style={{ marginLeft: 'auto', marginRight: '8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFixFindingKey(isFixActive ? null : rowKey);
                        }}
                      >
                        <VscLightbulb size={14} />
                      </button>

                      <div className={styles.problemLocation}>
                        line {diag.line + 1}, col {diag.column + 1}
                      </div>
                    </div>

                    {isFixActive && (
                      <QuickFixBox
                        options={quickFixOptions}
                        statusText={fixStatusMap[rowKey]}
                        filePath={diag.file_path || filePath}
                        line={diag.line}
                        column={diag.column}
                        workspaceRoot={workspaceRoot}
                        onReloadFile={onReloadFile}
                        onOpenFile={onOpenFile}
                        rowKey={rowKey}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
