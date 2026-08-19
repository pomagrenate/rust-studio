/**
 * CargoBuildPanel.tsx — JetBrains RustRover Style Build Progress & Output Panel.
 * Features:
 * - Subtabs: Sync, Build Output
 * - Left Actions: Filter (T), Stop Build (■), Pin (📌), Rerun (👁)
 * - Left Split: Build History tree with statuses and durations
 * - Right Split: Rich colored Cargo build log output
 * - Right Actions: Scroll to End, Soft-wrap, Clear All
 */

import { useState, useRef, useEffect } from "react";
import {
  VscCheck,
  VscError,
  VscLoading,
  VscClose,
  VscEllipsis,
  VscChromeMinimize,
  VscFilter,
  VscDebugStop,
  VscPin,
  VscDebugRerun,
  VscArrowDown,
  VscWordWrap,
  VscTrash
} from "react-icons/vsc";
import styles from "./CargoBuildPanel.module.css";

export interface BuildRecord {
  id: string;
  command: string;
  fullCommandLine: string;
  status: "running" | "success" | "error";
  timestamp: string;
  durationFormatted: string;
  output: string;
  exitCode: number;
}

interface CargoBuildPanelProps {
  buildRecords: BuildRecord[];
  activeBuildId?: string;
  onSelectBuild?: (id: string) => void;
  onRerunBuild?: () => void;
  onStopBuild?: () => void;
  onClearBuilds?: () => void;
  onClose?: () => void;
}

export function CargoBuildPanel({
  buildRecords = [],
  activeBuildId,
  onSelectBuild,
  onRerunBuild,
  onStopBuild,
  onClearBuilds,
  onClose,
}: CargoBuildPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"sync" | "buildOutput">("buildOutput");
  const [isSoftWrap, setIsSoftWrap] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [isFilterActive, setIsFilterActive] = useState(false);
  
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Selected build record
  const currentRecord = buildRecords.find((r) => r.id === activeBuildId) || buildRecords[0] || null;

  // Auto-scroll to end on new output
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentRecord?.output]);

  const handleScrollToEnd = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  // Helper to format log lines with JetBrains Cargo highlights
  const renderFormattedLog = (output: string, fullCmd: string, exitCode: number) => {
    const lines = output.split("\n");
    return (
      <>
        {fullCmd && <div className={styles.commandHeader}>{fullCmd}</div>}
        {lines.map((line, idx) => {
          let lineClass = styles.logLine;
          if (line.includes("Blocking waiting for file lock") || line.includes("Compiling") || line.includes("Finished")) {
            lineClass = `${styles.logLine} ${styles.logLineInfo}`;
          } else if (line.toLowerCase().includes("warning:")) {
            lineClass = `${styles.logLine} ${styles.logLineWarning}`;
          } else if (line.toLowerCase().includes("error:") || line.toLowerCase().includes("error[")) {
            lineClass = `${styles.logLine} ${styles.logLineError}`;
          }
          return (
            <span key={idx} className={lineClass}>
              {line}
            </span>
          );
        })}
        {exitCode !== undefined && (
          <div className={styles.logLineExit}>
            Process finished with exit code {exitCode}
          </div>
        )}
      </>
    );
  };

  const filteredRecords = filterQuery
    ? buildRecords.filter(
        (r) =>
          r.command.toLowerCase().includes(filterQuery.toLowerCase()) ||
          r.output.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : buildRecords;

  return (
    <div className={styles.buildPanelContainer}>
      {/* ── Subheader Tabs Bar ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitleBadge}>Build</span>
          <div className={styles.subTabsList}>
            <button
              className={`${styles.subTab} ${activeSubTab === "sync" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("sync")}
            >
              <span>Sync</span>
              <span className={styles.subTabClose}><VscClose size={12} /></span>
            </button>
            <button
              className={`${styles.subTab} ${activeSubTab === "buildOutput" ? styles.subTabActive : ""}`}
              onClick={() => setActiveSubTab("buildOutput")}
            >
              <span>Build Output</span>
              <span className={styles.subTabClose}><VscClose size={12} /></span>
            </button>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.iconBtn} title="More Options">
            <VscEllipsis size={16} />
          </button>
          <button className={styles.iconBtn} title="Minimize" onClick={onClose}>
            <VscChromeMinimize size={14} />
          </button>
        </div>
      </div>

      {/* ── Panel Body with Left Action Bar + Split Panes + Right Action Bar ── */}
      <div className={styles.panelBody}>
        {/* ── Left Action Bar (Filter, Stop, Pin, Rerun) ── */}
        <div className={styles.leftActionBar}>
          <button
            className={`${styles.actionToolBtn} ${isFilterActive ? styles.actionToolBtnActive : ""}`}
            title="Filter History"
            onClick={() => setIsFilterActive((prev) => !prev)}
          >
            <VscFilter />
          </button>

          <button
            className={`${styles.actionToolBtn} ${currentRecord?.status === "running" ? "" : styles.actionToolBtnDisabled}`}
            title="Stop Build (■)"
            onClick={onStopBuild}
            disabled={currentRecord?.status !== "running"}
          >
            <VscDebugStop color="#f85149" />
          </button>

          <button
            className={`${styles.actionToolBtn} ${isPinned ? styles.actionToolBtnActive : ""}`}
            title={isPinned ? "Unpin Tab" : "Pin Tab"}
            onClick={() => setIsPinned((prev) => !prev)}
          >
            <VscPin />
          </button>

          <button
            className={styles.actionToolBtn}
            title="Rerun Build / Command (👁)"
            onClick={onRerunBuild}
          >
            <VscDebugRerun color="#57ab5a" />
          </button>
        </div>

        {/* ── Left Pane: Build History Tree ── */}
        <div className={styles.historyPane}>
          {isFilterActive && (
            <div style={{ padding: "4px 8px 8px 8px" }}>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter build output..."
                style={{
                  width: "100%",
                  backgroundColor: "#2b2d30",
                  border: "1px solid #393b40",
                  color: "#dfe1e5",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>
          )}

          {filteredRecords.length === 0 ? (
            <div className={styles.emptyHistory}>No builds yet</div>
          ) : (
            filteredRecords.map((rec) => {
              const isSelected = rec.id === (currentRecord?.id || "");
              return (
                <div
                  key={rec.id}
                  className={`${styles.historyItem} ${isSelected ? styles.historyItemActive : ""}`}
                  onClick={() => onSelectBuild?.(rec.id)}
                >
                  {rec.status === "success" && (
                    <VscCheck className={styles.historyStatusIconSuccess} />
                  )}
                  {rec.status === "error" && (
                    <VscError className={styles.historyStatusIconError} />
                  )}
                  {rec.status === "running" && (
                    <VscLoading className={styles.historyStatusIconRunning} />
                  )}

                  <div className={styles.historyItemContent}>
                    <span className={styles.historyItemTitle}>
                      Run Cargo Command: {rec.command}{" "}
                      {rec.status === "success"
                        ? "successful"
                        : rec.status === "error"
                        ? "failed"
                        : "running..."}
                    </span>
                    <span className={styles.historyItemSubtitle}>
                      At {rec.timestamp} {rec.durationFormatted && `{ ${rec.durationFormatted} }`}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right Pane: Log Viewer ── */}
        <div className={styles.logPaneWrapper}>
          <div
            className={`${styles.logContainer} ${isSoftWrap ? styles.softWrap : styles.noWrap}`}
            ref={logContainerRef}
          >
            {currentRecord ? (
              renderFormattedLog(
                currentRecord.output,
                currentRecord.fullCommandLine,
                currentRecord.exitCode
              )
            ) : (
              <div style={{ color: "#8c9099" }}>
                Execute a Cargo Build or Run command to view logs here.
              </div>
            )}
          </div>

          {/* ── Right Action Bar (Scroll to End, Soft-wrap, Clear All) ── */}
          <div className={styles.rightActionBar}>
            <button
              className={styles.actionToolBtn}
              title="Scroll to End"
              onClick={handleScrollToEnd}
            >
              <VscArrowDown />
            </button>

            <button
              className={`${styles.actionToolBtn} ${isSoftWrap ? styles.actionToolBtnActive : ""}`}
              title={isSoftWrap ? "Disable Soft-wrap" : "Soft-wrap"}
              onClick={() => setIsSoftWrap((prev) => !prev)}
            >
              <VscWordWrap />
            </button>

            <button
              className={styles.actionToolBtn}
              title="Clear All"
              onClick={onClearBuilds}
            >
              <VscTrash />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CargoBuildPanel;
