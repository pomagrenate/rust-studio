/**
 * StatusBar.tsx — Bottom status bar.
 * Shows file info, cursor position, EOL, encoding, and theme toggle.
 */

import type { ThemeId } from "../../hooks/useTheme";
import styles from "./StatusBar.module.css";

interface StatusBarProps {
  filePath?: string;
  lineCount?: number;
  activeLine?: number;
  activeCol?: number;
  eol?: "Lf" | "CrLf" | "Cr";
  encoding?: string;
  language?: string;
  isDirty?: boolean;
  theme: ThemeId;
  onToggleTheme: () => void;
  // LSP status indicator
  lspStatus?: { kind: string; percent?: number; message?: string };
}

export function StatusBar({
  filePath,
  lineCount = 0,
  activeLine = 0,
  activeCol = 0,
  eol = "Lf",
  encoding = "UTF-8",
  language = "TypeScript",
  isDirty = false,
  theme,
  onToggleTheme,
  lspStatus,
}: StatusBarProps) {
  const fileName = filePath?.split(/[\/]/).pop() ?? "Untitled";

  // Get display text for theme toggle button
  const getThemeDisplay = () => {
    if (theme === "light") return "☽ Dark";
    if (theme === "dark") return "☀ Light";
    return "⟲ System";
  };

  // LSP status display
  const getLspStatusDisplay = () => {
    if (!lspStatus) return null;
    switch (lspStatus.kind) {
      case "starting":
        return <span className={styles.lspStatusStarting}>LSP Starting...</span>;
      case "ready":
        return <span className={styles.lspStatusReady}>LSP Ready</span>;
      case "indexing":
        return <span className={styles.lspStatusIndexing}>Indexing {lspStatus.percent}%</span>;
      case "error":
        return <span className={styles.lspStatusError} title={lspStatus.message}>LSP Error</span>;
      case "stopped":
        return <span className={styles.lspStatusStopped}>LSP Stopped</span>;
      default:
        return null;
    }
  };

  return (
    <footer className={styles.statusBar} aria-label="Status bar">
      {/* ── Left section ── */}
      <div className={styles.statusLeft}>
        <span className={styles.statusItem} title={filePath}>
          {isDirty && <span className={styles.dirtyDot} aria-label="Unsaved changes" />}
          {fileName}
        </span>
        <span className={styles.statusSep}>|</span>
        <span className={styles.statusItem}>
          Ln {activeLine + 1}, Col {activeCol + 1}
        </span>
        <span className={styles.statusSep}>|</span>
        <span className={styles.statusItem}>{lineCount} lines</span>
      </div>

      {/* ── Right section ── */}
      <div className={styles.statusRight}>
        {getLspStatusDisplay()}
        {lspStatus && <span className={styles.statusSep}>|</span>}
        <span className={styles.statusItem}>{language}</span>
        <span className={styles.statusSep}>|</span>
        <span className={styles.statusItem}>{eol === "CrLf" ? "CRLF" : eol}</span>
        <span className={styles.statusSep}>|</span>
        <span className={styles.statusItem}>{encoding}</span>
        <span className={styles.statusSep}>|</span>
        <button
          className={styles.themeToggle}
          onClick={onToggleTheme}
          title={`Switch theme (current: ${theme})`}
          aria-label={`Switch theme (current: ${theme})`}
        >
          {getThemeDisplay()}
        </button>
      </div>
    </footer>
  );
}

export default StatusBar;
