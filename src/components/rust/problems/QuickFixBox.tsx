/**
 * QuickFixBox.tsx — Reusable Quick Fix popover box with LSP Code Actions integration
 */

import { useState, useEffect } from "react";
import { VscLightbulb, VscTools, VscSymbolMisc, VscRefresh } from "react-icons/vsc";
import { CodeAction } from "../../../ipc/lsp";
import { applyLspWorkspaceEdit, fetchLspCodeActions } from "./quickFixHelpers";
import styles from "../ProblemsPanel.module.css";

export interface QuickFixOption {
  title: string;
  onApply: () => void;
}

interface QuickFixBoxProps {
  options: QuickFixOption[];
  statusText?: string;
  filePath?: string;
  line?: number;
  column?: number;
  workspaceRoot?: string;
  onReloadFile?: (filePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  rowKey?: string;
}

export function QuickFixBox({
  options,
  statusText,
  filePath,
  line,
  column,
  workspaceRoot,
  onReloadFile,
  onOpenFile,
  rowKey = "default",
}: QuickFixBoxProps) {
  const [lspActions, setLspActions] = useState<CodeAction[]>([]);
  const [fetchingLsp, setFetchingLsp] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (filePath && line !== undefined && column !== undefined) {
      let isMounted = true;
      setFetchingLsp(true);

      fetchLspCodeActions(filePath, line, column, workspaceRoot)
        .then((actions) => {
          if (isMounted) {
            setLspActions(actions);
          }
        })
        .finally(() => {
          if (isMounted) setFetchingLsp(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [filePath, line, column, workspaceRoot]);

  const handleApplyLspAction = async (action: CodeAction) => {
    if (action.edit) {
      setLocalStatus(`Applying: ${action.title}...`);
      await applyLspWorkspaceEdit(
        action.edit,
        rowKey,
        workspaceRoot,
        onReloadFile,
        onOpenFile,
        (updater) => {
          const res = typeof updater === "function" ? updater({}) : updater;
          if (res[rowKey]) setLocalStatus(res[rowKey]);
        }
      );
    } else {
      setLocalStatus(`Action "${action.title}" executed.`);
    }
  };

  return (
    <div className={styles.quickFixBox} onClick={(e) => e.stopPropagation()}>
      <div className={styles.quickFixHeader}>
        <VscLightbulb color="#d97706" />
        <span>Suggested Quick Fixes</span>
        {fetchingLsp && <VscRefresh className={styles.spinIcon} style={{ marginLeft: "auto" }} />}
      </div>

      <div className={styles.quickFixOptionsList}>
        {/* 1. Live LSP Code Actions from rust-analyzer */}
        {lspActions.map((action, idx) => (
          <div key={`lsp-${idx}`} className={styles.quickFixOption}>
            <span className={styles.quickFixOptionTitle} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <VscSymbolMisc color="#38bdf8" />
              <strong>[rust-analyzer]</strong> {action.title}
            </span>
            <button className={styles.quickFixApplyBtn} onClick={() => handleApplyLspAction(action)}>
              <VscTools /> Apply Code Action
            </button>
          </div>
        ))}

        {/* 2. Deterministic IDE Pattern Fixes */}
        {options.map((opt, idx) => (
          <div key={`opt-${idx}`} className={styles.quickFixOption}>
            <span className={styles.quickFixOptionTitle}>{opt.title}</span>
            <button className={styles.quickFixApplyBtn} onClick={opt.onApply}>
              <VscTools /> Apply Fix
            </button>
          </div>
        ))}

        {(localStatus || statusText) && (
          <div className={styles.quickFixStatus}>{localStatus || statusText}</div>
        )}
      </div>
    </div>
  );
}
