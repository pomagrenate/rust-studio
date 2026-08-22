/**
 * FileProblemsView.tsx — Tab 1 component rendering problems in the active file
 */

import { VscError, VscWarning, VscInfo, VscLightbulb } from "react-icons/vsc";
import { CargoDiagnostic } from "../../../extensions/builtin/rust/CargoProvider";
import { QuickFixBox } from "./QuickFixBox";
import { applyProjectErrorFix, getProjectErrorQuickFixes } from "./quickFixHelpers";
import styles from "../ProblemsPanel.module.css";

interface FileProblemsViewProps {
  activeFile?: string;
  fileDiagnostics: CargoDiagnostic[];
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

export function FileProblemsView({
  activeFile,
  fileDiagnostics,
  selectedProblemKey,
  activeFixFindingKey,
  setActiveFixFindingKey,
  fixStatusMap,
  setFixStatusMap,
  handleProblemClick,
  workspaceRoot,
  onReloadFile,
  onOpenFile,
}: FileProblemsViewProps) {
  if (!activeFile || activeFile === "Welcome") {
    return <div className={styles.emptyState}>Open file in editor to see problems</div>;
  }

  if (fileDiagnostics.length === 0) {
    return <div className={styles.emptyState}>No problems found in current file</div>;
  }

  return (
    <div className={styles.contentArea}>
      {fileDiagnostics.map((diag, idx) => {
        const rowKey = `file-${idx}-${diag.line}-${diag.column}`;
        const isSelected = selectedProblemKey === rowKey;
        const isFixActive = activeFixFindingKey === rowKey;
        const quickFixes = getProjectErrorQuickFixes(diag);

        const quickFixOptions = quickFixes.map((fix) => ({
          title: fix.title,
          onApply: () =>
            applyProjectErrorFix(
              diag.file_path || activeFile,
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
            onClick={() => handleProblemClick(diag.file_path || activeFile, diag.line, diag.column, rowKey)}
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
                filePath={diag.file_path || activeFile}
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
