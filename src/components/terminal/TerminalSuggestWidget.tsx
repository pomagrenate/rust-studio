/**
 * TerminalSuggestWidget.tsx
 * Floating Autocompletion Popup & Quick Command Bar for the Terminal.
 */

import { useState, useEffect } from "react";
import { FaHammer } from "react-icons/fa";
import { VscGitBranch, VscTag, VscSymbolMethod, VscTerminal } from "react-icons/vsc";
import { TerminalSuggestItem } from "../../extensions/builtin/terminal/CargoSuggestEngine";
import styles from "./TerminalSuggestWidget.module.css";

interface TerminalSuggestWidgetProps {
  suggestions: TerminalSuggestItem[];
  selectedIndex: number;
  onSelectSuggestion: (item: TerminalSuggestItem) => void;
  onClose: () => void;
}

export function TerminalSuggestWidget({
  suggestions,
  selectedIndex,
  onSelectSuggestion,
  onClose,
}: TerminalSuggestWidgetProps) {
  const [activeIdx, setActiveIdx] = useState(selectedIndex);

  useEffect(() => {
    setActiveIdx(selectedIndex);
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  const getItemIcon = (item: TerminalSuggestItem) => {
    if (item.category === "cargo") {
      if (item.kind === "flag") return <VscTag color="#d29922" />;
      if (item.kind === "target") return <VscSymbolMethod color="#005fb8" />;
      return <FaHammer color="#f05033" size={11} />;
    }
    if (item.category === "git") {
      if (item.kind === "branch") return <VscGitBranch color="#1a7f37" />;
      return <VscGitBranch color="#f05033" />;
    }
    return <VscTerminal color="#005fb8" />;
  };

  return (
    <div className={styles.suggestContainer} tabIndex={-1}>
      <div className={styles.suggestHeader}>
        <span>Suggestions (Tab / Enter to accept)</span>
        <span style={{ cursor: "pointer" }} onClick={onClose}>
          ✕
        </span>
      </div>

      <div className={styles.suggestList}>
        {suggestions.map((item, idx) => {
          const isSelected = idx === activeIdx;

          return (
            <div
              key={`${item.label}-${idx}`}
              className={`${styles.suggestItem} ${isSelected ? styles.suggestItemActive : ""}`}
              onClick={() => onSelectSuggestion(item)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className={styles.suggestIcon}>{getItemIcon(item)}</span>
              <span className={styles.suggestLabel}>{item.label}</span>
              <span className={styles.suggestDetail}>{item.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface QuickTerminalBarProps {
  onExecuteCommand: (command: string) => void;
}

export function QuickTerminalBar({ onExecuteCommand }: QuickTerminalBarProps) {
  const quickCommands = [
    { label: "cargo build", cmd: "cargo build\r" },
    { label: "cargo check", cmd: "cargo check\r" },
    { label: "cargo test", cmd: "cargo test -- --nocapture\r" },
    { label: "cargo clippy", cmd: "cargo clippy -- -D warnings\r" },
    { label: "cargo run", cmd: "cargo run\r" },
    { label: "git status", cmd: "git status\r" },
  ];

  return (
    <div className={styles.quickActionBar}>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--pm-fg-muted)", marginRight: "4px" }}>
        Quick:
      </span>
      {quickCommands.map((qc) => (
        <button
          key={qc.label}
          className={styles.quickChip}
          onClick={() => onExecuteCommand(qc.cmd)}
          title={`Execute '${qc.label}' in terminal`}
        >
          <span>{qc.label}</span>
        </button>
      ))}
    </div>
  );
}

export default TerminalSuggestWidget;
