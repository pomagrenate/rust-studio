/**
 * ProblemsHeader.tsx — Top header bar & subtab switcher for Problems Panel
 */

import React from "react";
import {
  VscEllipsis,
  VscChromeMinimize,
  VscEye,
  VscListTree
} from "react-icons/vsc";
import styles from "../ProblemsPanel.module.css";

interface ProblemsHeaderProps {
  activeSubTab: "file" | "project" | "linter" | "clippy";
  setActiveSubTab: (tab: "file" | "project" | "linter" | "clippy") => void;
  fileErrorCount: number;
  fileWarningCount: number;
  totalProjectErrors: number;
  totalProjectWarnings: number;
  linterCount: number;
  linterErrorCount: number;
  clippyCount: number;
  groupByFile: boolean;
  setGroupByFile: React.Dispatch<React.SetStateAction<boolean>>;
  previewMode: boolean;
  setPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onClose?: () => void;
}

export function ProblemsHeader({
  activeSubTab,
  setActiveSubTab,
  fileErrorCount,
  fileWarningCount,
  totalProjectErrors,
  totalProjectWarnings,
  linterCount,
  linterErrorCount,
  clippyCount,
  groupByFile,
  setGroupByFile,
  previewMode,
  setPreviewMode,
  isMoreMenuOpen,
  setIsMoreMenuOpen,
  onClose,
}: ProblemsHeaderProps) {
  return (
    <div className={styles.panelHeader}>
      <div className={styles.subTabsList}>
        {/* File Problems Tab */}
        <button
          className={`${styles.subTab} ${activeSubTab === "file" ? styles.subTabActive : ""}`}
          onClick={() => setActiveSubTab("file")}
        >
          File Problems
          {fileErrorCount > 0 && (
            <span className={`${styles.badgePill} ${styles.badgePillError}`}>{fileErrorCount}</span>
          )}
          {fileWarningCount > 0 && (
            <span className={`${styles.badgePill} ${styles.badgePillWarning}`}>{fileWarningCount}</span>
          )}
        </button>

        {/* Project Errors Tab */}
        <button
          className={`${styles.subTab} ${activeSubTab === "project" ? styles.subTabActive : ""}`}
          onClick={() => setActiveSubTab("project")}
        >
          Project Errors
          {totalProjectErrors > 0 && (
            <span className={`${styles.badgePill} ${styles.badgePillError}`}>{totalProjectErrors}</span>
          )}
          {totalProjectWarnings > 0 && (
            <span className={`${styles.badgePill} ${styles.badgePillWarning}`}>{totalProjectWarnings}</span>
          )}
        </button>

        {/* Pomai Linter Engine Tab */}
        <button
          className={`${styles.subTab} ${activeSubTab === "linter" ? styles.subTabActive : ""}`}
          onClick={() => setActiveSubTab("linter")}
        >
          Pomai Linter
          {linterCount > 0 && (
            <span className={`${styles.badgePill} ${linterErrorCount > 0 ? styles.badgePillError : styles.badgePillWarning}`}>
              {linterCount}
            </span>
          )}
        </button>

        {/* Cargo Clippy Tab */}
        <button
          className={`${styles.subTab} ${activeSubTab === "clippy" ? styles.subTabActive : ""}`}
          onClick={() => setActiveSubTab("clippy")}
        >
          Clippy
          {clippyCount > 0 && (
            <span className={`${styles.badgePill} ${styles.badgePillWarning}`}>{clippyCount}</span>
          )}
        </button>
      </div>

      <div className={styles.headerRight}>
        <button
          className={`${styles.iconBtn} ${groupByFile ? styles.actionToolBtnActive : ""}`}
          title="Group by File"
          onClick={() => setGroupByFile((v) => !v)}
        >
          <VscListTree />
        </button>

        <button
          className={`${styles.iconBtn} ${previewMode ? styles.actionToolBtnActive : ""}`}
          title="Preview Mode"
          onClick={() => setPreviewMode((v) => !v)}
        >
          <VscEye />
        </button>

        {/* More Actions Dropdown Menu */}
        <div className={styles.moreMenuWrapper}>
          <button
            className={`${styles.iconBtn} ${isMoreMenuOpen ? styles.actionToolBtnActive : ""}`}
            title="More Actions"
            onClick={(e) => {
              e.stopPropagation();
              setIsMoreMenuOpen((v) => !v);
            }}
          >
            <VscEllipsis />
          </button>

          {isMoreMenuOpen && (
            <div className={styles.moreMenuDropdown} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.moreMenuItem}
                onClick={() => {
                  setGroupByFile(true);
                  setIsMoreMenuOpen(false);
                }}
              >
                <VscListTree /> Group Diagnostics by File
              </button>
              <button
                className={styles.moreMenuItem}
                onClick={() => {
                  setGroupByFile(false);
                  setIsMoreMenuOpen(false);
                }}
              >
                Flat List View
              </button>
              <div className={styles.moreMenuDivider} />
              <button
                className={styles.moreMenuItem}
                onClick={() => {
                  setActiveSubTab("file");
                  setIsMoreMenuOpen(false);
                }}
              >
                Switch to File Problems
              </button>
              <button
                className={styles.moreMenuItem}
                onClick={() => {
                  setActiveSubTab("project");
                  setIsMoreMenuOpen(false);
                }}
              >
                Switch to Project Errors
              </button>
              <button
                className={styles.moreMenuItem}
                onClick={() => {
                  setActiveSubTab("linter");
                  setIsMoreMenuOpen(false);
                }}
              >
                Switch to Pomai Linter
              </button>
            </div>
          )}
        </div>

        {onClose && (
          <button className={styles.iconBtn} title="Minimize / Close Panel" onClick={onClose}>
            <VscChromeMinimize />
          </button>
        )}
      </div>
    </div>
  );
}
