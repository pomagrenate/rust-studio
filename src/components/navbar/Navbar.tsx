/**
 * Navbar.tsx — JetBrains RustRover Style Header.
 * Collapses traditional menu bar into hamburger menu '☰', shows active workspace and Git branch pills,
 * and integrates the Search Everywhere trigger.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  VscMenu,
  VscArrowLeft,
  VscArrowRight,
  VscChevronDown,
  VscChevronRight,
  VscAdd,
  VscFolder,
  VscGitPullRequest,
  VscSearch,
  VscGear,
  VscSparkle,
  VscChromeMinimize,
  VscChromeMaximize,
  VscChromeClose,
  VscSignOut,
  VscPlay,
  VscBug,
  VscWarning,
  VscTerminal,
  VscBeaker,
  VscReferences,
  VscBook,
  VscArchive
} from "react-icons/vsc";
import { FaHammer } from "react-icons/fa";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SettingsPanel } from "../settings/SettingsPanel";
import styles from "./Navbar.module.css";

export interface NavbarProps {
  workspaceRoot?: string;
  activeBranch?: string;
  branches?: string[];
  onSelectBranch?: (branch: string) => void;
  onNewBranch?: () => void;
  onNewFile?: () => void;
  onNewPhysicalFile?: () => void;
  onNewWindow?: () => void;
  onNewProject?: () => void;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onAddFolderToWorkspace?: () => void;
  onSaveWorkspaceAs?: () => void;
  onDuplicateWorkspace?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onSaveAll?: () => void;
  onRevertFile?: () => void;
  onCloseEditor?: () => void;
  onCloseFolder?: () => void;
  onCloseWindow?: () => void;
  onCloneVcs?: () => void;
  onOpenRecent?: (path: string, isFolder: boolean) => void;
  onOpenSearchEverywhere?: () => void;
  onOpenSettings?: () => void;
  onToggleTerminal?: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onRunBuild?: () => void;
  onStartRun?: () => void;
  onRunDebug?: () => void;
  onCargoCheck?: () => void;
  onCargoClippy?: () => void;
  onClippyAutoFix?: () => void;
  onExitToWorkspace?: () => void;
  onExit?: () => void;
  // Edit Actions
  onUndo?: () => void;
  onRedo?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
  onSelectAll?: () => void;
  isProblemsOpen?: boolean;
  onToggleProblems?: () => void;
  problemsBadgeCount?: number;
  isTestsOpen?: boolean;
  onToggleTests?: () => void;
  isHierarchyOpen?: boolean;
  onToggleHierarchy?: () => void;
  isTerminalOpen?: boolean;
  isScmOpen?: boolean;
  onToggleScm?: () => void;
  scmBadgeCount?: number;
  isBuilding?: boolean;
  onCancelBuild?: () => void;
  isCodeWikiOpen?: boolean;
  onToggleCodeWiki?: () => void;
  isBackupModalOpen?: boolean;
  onToggleBackupModal?: () => void;
}

interface RecentlyOpened {
  workspaces: string[];
  files: string[];
}

type DropdownKind = "hamburger" | "workspace" | "git" | null;
type HamburgerSubmenu = "file" | "edit" | "view" | "navigate" | "code" | "build" | "run" | "git" | "tools" | "help" | null;

export const Navbar = React.memo(function Navbar({
  workspaceRoot,
  activeBranch = "main",
  branches = ["main", "dev"],
  onSelectBranch,
  onNewBranch,
  onNewFile,
  onNewPhysicalFile,
  onNewWindow,
  onNewProject,
  onOpenFile,
  onOpenFolder,
  onAddFolderToWorkspace,
  onSaveWorkspaceAs,
  onDuplicateWorkspace,
  onSave,
  onSaveAs,
  onSaveAll,
  onRevertFile,
  onCloseEditor,
  onCloseFolder,
  onCloseWindow,
  onCloneVcs,
  onOpenRecent,
  onOpenSearchEverywhere,
  onOpenSettings,
  onToggleTerminal,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
  onRunBuild,
  onStartRun,
  onRunDebug,
  onCargoCheck,
  onCargoClippy,
  onClippyAutoFix,
  onExitToWorkspace,
  onExit,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onFind,
  onReplace,
  onSelectAll,
  isProblemsOpen,
  onToggleProblems,
  problemsBadgeCount = 0,
  isTestsOpen,
  onToggleTests,
  isHierarchyOpen,
  onToggleHierarchy,
  isTerminalOpen,
  isScmOpen,
  onToggleScm,
  scmBadgeCount = 0,
  isBuilding = false,
  onCancelBuild,
  isCodeWikiOpen,
  onToggleCodeWiki,
  isBackupModalOpen,
  onToggleBackupModal,
}: NavbarProps) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownKind>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<HamburgerSubmenu>(null);
  const [showRunDropdown, setShowRunDropdown] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentlyOpened>({ workspaces: [], files: [] });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Real Git branch state driven by Rust invoke
  const [localActiveBranch, setLocalActiveBranch] = useState<string>(activeBranch);
  const [localBranches, setLocalBranches] = useState<string[]>(branches);

  // Sync state if props update
  useEffect(() => {
    if (activeBranch) setLocalActiveBranch(activeBranch);
  }, [activeBranch]);

  useEffect(() => {
    if (branches && branches.length > 0) setLocalBranches(branches);
  }, [branches]);

  // Fetch branch information directly from Rust src-tauri/src/github & src-tauri/src/commands/git_commands
  const refreshGitBranchInfo = useCallback(async () => {
    if (!workspaceRoot || !window.__TAURI_INTERNALS__) return;

    try {
      const fetchedBranches = await invoke<string[]>("git_get_branches", { repoPath: workspaceRoot });
      if (fetchedBranches && fetchedBranches.length > 0) {
        setLocalBranches(fetchedBranches);
      }
    } catch (err) {
      console.error("Failed to fetch git branches from Rust:", err);
    }

    try {
      const statusRes = await invoke<{ branch?: string }>("git_status", { repoPath: workspaceRoot });
      if (statusRes && statusRes.branch) {
        setLocalActiveBranch(statusRes.branch);
      }
    } catch (_err) {
      try {
        const repoInfo = await invoke<{ current_branch?: string }>("github_get_repo_info", { repoPath: workspaceRoot });
        if (repoInfo && repoInfo.current_branch) {
          setLocalActiveBranch(repoInfo.current_branch);
        }
      } catch (e) {
        console.error("Failed to fetch repo info from Rust src-tauri/src/github:", e);
      }
    }
  }, [workspaceRoot]);

  useEffect(() => {
    refreshGitBranchInfo();
  }, [refreshGitBranchInfo]);

  useEffect(() => {
    if (activeDropdown === "git") {
      refreshGitBranchInfo();
    }
  }, [activeDropdown, refreshGitBranchInfo]);

  const handleSelectBranchItem = async (b: string) => {
    setActiveDropdown(null);
    setActiveSubmenu(null);

    if (window.__TAURI_INTERNALS__ && workspaceRoot) {
      try {
        await invoke("git_checkout", { repoPath: workspaceRoot, branch: b });
        setLocalActiveBranch(b);
        await refreshGitBranchInfo();
      } catch (err) {
        console.error("Failed to checkout branch via Rust:", err);
      }
    } else {
      setLocalActiveBranch(b);
    }

    onSelectBranch?.(b);
  };

  const handleNewBranchItem = async () => {
    setActiveDropdown(null);
    setActiveSubmenu(null);

    const branchName = prompt("Enter new branch name:");
    if (branchName && branchName.trim()) {
      const trimmed = branchName.trim();
      if (window.__TAURI_INTERNALS__ && workspaceRoot) {
        try {
          await invoke("git_create_branch", { repoPath: workspaceRoot, branchName: trimmed });
          await invoke("git_checkout", { repoPath: workspaceRoot, branch: trimmed });
          setLocalActiveBranch(trimmed);
          await refreshGitBranchInfo();
        } catch (err) {
          console.error("Failed to create new branch via Rust:", err);
        }
      } else {
        setLocalActiveBranch(trimmed);
        setLocalBranches(prev => [...prev.filter(x => x !== trimmed), trimmed]);
      }

      onNewBranch?.();
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
        setActiveSubmenu(null);
        setShowRunDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch recent items when workspace dropdown opens
  useEffect(() => {
    if (activeDropdown === "workspace" || activeDropdown === "hamburger") {
      if (window.__TAURI_INTERNALS__) {
        invoke<RecentlyOpened>("get_recently_opened")
          .then((data) => setRecentItems(data))
          .catch(console.error);
      } else {
        setRecentItems({
          workspaces: [
            workspaceRoot || "E:\\GithubProjects\\pomai-studio",
            "C:\\Projects\\rust-game-server",
          ],
          files: [],
        });
      }
    }
  }, [activeDropdown, workspaceRoot]);

  const workspaceName = workspaceRoot
    ? workspaceRoot.split(/[/\\]/).pop() || workspaceRoot
    : "untitled";
  const avatarLetter = workspaceName.charAt(0).toUpperCase() || "U";

  const closeDropdowns = () => {
    setActiveDropdown(null);
    setActiveSubmenu(null);
  };

  const handleWindowMinimize = () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        getCurrentWindow().minimize();
      } catch (err) {
        console.error("Window minimize error:", err);
      }
    }
  };

  const handleWindowMaximize = () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.error("Window maximize error:", err);
      }
    }
  };

  const handleWindowClose = () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        getCurrentWindow().close();
      } catch (err) {
        console.error("Window close error:", err);
      }
    }
  };

  return (
    <>
      <header className={styles.navbar} ref={navRef} data-tauri-drag-region>
      {/* ── Left Controls: Hamburger, Navigation, Workspace Pill, Git Pill ── */}
      <div className={styles.navLeft}>
        {/* Hamburger Menu Button */}
        <button
          className={`${styles.iconBtn} ${activeDropdown === "hamburger" ? styles.iconBtnActive : ""}`}
          onClick={() => {
            setActiveDropdown(activeDropdown === "hamburger" ? null : "hamburger");
            setActiveSubmenu(null);
          }}
          title="Main Menu"
        >
          <VscMenu size={20} />
        </button>

        {/* Back / Forward History Navigation */}
        <div className={styles.navArrows}>
          <button
            className={`${styles.iconBtn} ${!canNavigateBack ? styles.iconBtnDisabled : ""}`}
            onClick={canNavigateBack ? onNavigateBack : undefined}
            disabled={!canNavigateBack}
            title={canNavigateBack ? "Navigate to Previous File (Alt+Left)" : "No Previous File"}
          >
            <VscArrowLeft size={18} />
          </button>
          <button
            className={`${styles.iconBtn} ${!canNavigateForward ? styles.iconBtnDisabled : ""}`}
            onClick={canNavigateForward ? onNavigateForward : undefined}
            disabled={!canNavigateForward}
            title={canNavigateForward ? "Navigate to Next File (Alt+Right)" : "No Next File"}
          >
            <VscArrowRight size={18} />
          </button>
        </div>

        {/* Workspace Selector Pill */}
        <button
          className={`${styles.workspacePill} ${activeDropdown === "workspace" ? styles.workspacePillActive : ""}`}
          onClick={() => {
            setActiveDropdown(activeDropdown === "workspace" ? null : "workspace");
            setActiveSubmenu(null);
          }}
          title={`Active Workspace: ${workspaceRoot || "untitled"}`}
        >
          <div className={styles.projectAvatar}>{avatarLetter}</div>
          <span>{workspaceName}</span>
          <VscChevronDown className={styles.pillChevron} />
        </button>

        {/* Git Branch Pill */}
        <button
          className={`${styles.gitPill} ${activeDropdown === "git" ? styles.gitPillActive : ""}`}
          onClick={() => {
            setActiveDropdown(activeDropdown === "git" ? null : "git");
            setActiveSubmenu(null);
          }}
          title={`Git Branch: ${localActiveBranch}`}
        >
          <VscGitPullRequest size={17} color="#3574f0" />
          <span>{localActiveBranch || "Git"}</span>
          <VscChevronDown className={styles.pillChevron} />
        </button>
      </div>

      {/* ── Right Controls: Build/Run/Debug, AI Assistant, Search Everywhere, Settings, Window Controls ── */}
      <div className={styles.navRight}>
        {/* Tool Window Toggles */}
        <div className={styles.navArrows} style={{ marginRight: "8px" }}>
          <button
            className={`${styles.iconBtn} ${isProblemsOpen ? styles.iconBtnActive : ''}`}
            onClick={onToggleProblems}
            title="Problems (Project & File Errors)"
            style={{ position: 'relative' }}
          >
            <VscWarning size={16} />
            {problemsBadgeCount > 0 && (
              <div style={{
                position: 'absolute', top: 2, right: 2, background: '#d29922', color: 'white', 
                fontSize: '9px', padding: '1px 3px', borderRadius: '4px', lineHeight: 1
              }}>
                {problemsBadgeCount > 99 ? "99+" : problemsBadgeCount}
              </div>
            )}
          </button>
          <button
            className={`${styles.iconBtn} ${isScmOpen ? styles.iconBtnActive : ''}`}
            onClick={onToggleScm}
            title="Source Control"
            style={{ position: 'relative' }}
          >
            <VscGitPullRequest size={16} />
            {scmBadgeCount > 0 && (
              <div style={{
                position: 'absolute', top: 2, right: 2, background: '#3574f0', color: 'white', 
                fontSize: '9px', padding: '1px 3px', borderRadius: '4px', lineHeight: 1
              }}>
                {scmBadgeCount > 99 ? "99+" : scmBadgeCount}
              </div>
            )}
          </button>
          <button
            className={`${styles.iconBtn} ${isTestsOpen ? styles.iconBtnActive : ''}`}
            onClick={onToggleTests}
            title="Rust Test Explorer"
          >
            <VscBeaker size={16} />
          </button>
          <button
            className={`${styles.iconBtn} ${isHierarchyOpen ? styles.iconBtnActive : ''}`}
            onClick={onToggleHierarchy}
            title="Hierarchy Inspector"
          >
            <VscReferences size={16} />
          </button>
          <button
            className={`${styles.iconBtn} ${isTerminalOpen ? styles.iconBtnActive : ''}`}
            onClick={onToggleTerminal}
            title="Toggle Terminal"
          >
            <VscTerminal size={16} />
          </button>
        </div>

        {/* Run / Build / Debug Actions */}
        <div className={styles.runActionsGroup}>
          {/* Build Project (Hammer) / Cancel Build (References) */}
          {isBuilding ? (
            <button
              className={`${styles.iconBtn} ${styles.iconBtnActive}`}
              title="Cancel Build"
              onClick={onCancelBuild}
              aria-label="Cancel Build"
              style={{ position: 'relative' }}
            >
              <FaHammer size={14} className="spin" />
              <div style={{ position: 'absolute', right: 2, bottom: 2, background: 'red', borderRadius: '50%', width: 6, height: 6 }}></div>
            </button>
          ) : (
            <button
              className={styles.iconBtn}
              title="Build Project (Ctrl+F9 / Cargo Build)"
              onClick={onRunBuild}
              aria-label="Run Build"
            >
              <FaHammer size={14} />
            </button>
          )}

          {/* Start / Run (Green Play) with Dropdown */}
          <div className={styles.runDropdownWrapper}>
            <button
              className={`${styles.iconBtn} ${showRunDropdown ? styles.iconBtnActive : ""}`}
              title="Run Project (Shift+F10 / Cargo Run)"
              onClick={() => setShowRunDropdown(!showRunDropdown)}
              aria-label="Start Run"
            >
              <VscPlay size={16} color="#388a34" />
            </button>
            
            {showRunDropdown && (
              <div className={styles.runDropdown}>
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    setShowRunDropdown(false);
                    onStartRun?.();
                  }}
                >
                  <div className={styles.menuItemIcon}><VscPlay size={14} color="#388a34" /></div>
                  <span className={styles.menuItemText}>Run</span>
                  <span className={styles.menuItemShortcut}>Shift+F10</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    setShowRunDropdown(false);
                    onCargoClippy?.();
                  }}
                >
                  <div className={styles.menuItemIcon}><VscWarning size={14} color="#d29922" /></div>
                  <span className={styles.menuItemText}>Run Clippy</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    setShowRunDropdown(false);
                    onCargoCheck?.();
                  }}
                >
                  <div className={styles.menuItemIcon}><VscBeaker size={14} color="#0078d4" /></div>
                  <span className={styles.menuItemText}>Run Check</span>
                </div>
                <div
                  className={styles.menuItem}
                  onClick={() => {
                    setShowRunDropdown(false);
                    onClippyAutoFix?.();
                  }}
                >
                  <div className={styles.menuItemIcon}><FaHammer size={14} color="#ce422b" /></div>
                  <span className={styles.menuItemText}>Auto-Fix Clippy</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Shift+Alt+F</span>
                </div>
              </div>
            )}
          </div>

          {/* Run Debug (Green Bug) */}
          <button
            className={styles.iconBtn}
            title="Debug Project (Shift+F9 / Cargo Debug)"
            onClick={onRunDebug}
            aria-label="Run Debug"
          >
            <VscBug size={16} color="#388a34" />
          </button>
        </div>

        <button
          className={styles.iconBtn}
          title="AI Assistant / Code Intelligence"
          onClick={() => {}}
        >
          <VscSparkle size={18} color="#0078d4" />
        </button>

        {/* CodeWiki Icon Button */}
        <button
          className={`${styles.iconBtn} ${isCodeWikiOpen ? styles.iconBtnActive : ""}`}
          title="CodeWiki / Offline Architecture Graph & Documentation"
          onClick={onToggleCodeWiki}
          aria-label="Toggle CodeWiki"
        >
          <VscBook size={18} color="#0078d4" />
        </button>

        {/* Local Code Backup Icon Button */}
        <button
          className={`${styles.iconBtn} ${isBackupModalOpen ? styles.iconBtnActive : ""}`}
          title="Code Backup Manager / Local Workspace Snapshots"
          onClick={onToggleBackupModal}
          aria-label="Toggle Code Backup Manager"
        >
          <VscArchive size={18} color="#0078d4" />
        </button>

        {/* Search Everywhere Icon Button */}
        <button
          className={styles.iconBtn}
          title="Search Everywhere (Double Shift / Ctrl+Shift+F)"
          onClick={onOpenSearchEverywhere}
        >
          <VscSearch size={18} />
        </button>

        <button
          className={styles.iconBtn}
          title="Settings (Ctrl+,)"
          onClick={() => {
            setIsSettingsOpen(true);
            onOpenSettings?.();
          }}
        >
          <VscGear size={18} />
        </button>

        <div className={styles.windowControls}>
          <button
            className={styles.windowControlBtn}
            onClick={handleWindowMinimize}
            title="Minimize"
          >
            <VscChromeMinimize />
          </button>
          <button
            className={styles.windowControlBtn}
            onClick={handleWindowMaximize}
            title="Maximize"
          >
            <VscChromeMaximize />
          </button>
          <button
            className={`${styles.windowControlBtn} ${styles.windowControlClose}`}
            onClick={handleWindowClose}
            title="Close"
          >
            <VscChromeClose />
          </button>
        </div>
      </div>

      {/* ── Dropdown 1: Workspace Selector Dropdown (Matches Screenshot 3) ── */}
      {activeDropdown === "workspace" && (
        <div className={`${styles.dropdownMenu} ${styles.workspaceDropdown}`}>
          <div
            className={styles.menuItem}
            onClick={() => {
              closeDropdowns();
              onNewProject?.();
            }}
          >
            <div className={styles.menuItemIcon}><VscAdd /></div>
            <span className={styles.menuItemText}>New Project...</span>
          </div>

          <div
            className={styles.menuItem}
            onClick={() => {
              closeDropdowns();
              onOpenFolder?.();
            }}
          >
            <div className={styles.menuItemIcon}><VscFolder /></div>
            <span className={styles.menuItemText}>Open...</span>
          </div>

          <div
            className={styles.menuItem}
            onClick={() => {
              closeDropdowns();
              onCloneVcs?.();
            }}
          >
            <div className={styles.menuItemIcon}><VscGitPullRequest /></div>
            <span className={styles.menuItemText}>Clone Repository...</span>
          </div>

          <div className={styles.dropdownDivider} />
          <div className={styles.dropdownSectionTitle}>Open Projects</div>

          {recentItems.workspaces.map((path) => {
            const name = path.split(/[/\\]/).pop() || path;
            const letter = name.charAt(0).toUpperCase() || "P";
            return (
              <div
                key={path}
                className={styles.projectRowItem}
                onClick={() => {
                  closeDropdowns();
                  onOpenRecent?.(path, true);
                }}
              >
                <div className={styles.projectAvatar}>{letter}</div>
                <div className={styles.projectRowText}>
                  <span className={styles.projectRowName}>{name}</span>
                  <span className={styles.projectRowPath}>{path}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dropdown 2: Git Branch Dropdown ── */}
      {activeDropdown === "git" && (
        <div className={`${styles.dropdownMenu} ${styles.gitDropdown}`}>
          <div className={styles.dropdownSectionTitle}>Branches</div>
          {localBranches.map((b) => (
            <div
              key={b}
              className={styles.menuItem}
              onClick={() => handleSelectBranchItem(b)}
            >
              <div className={styles.menuItemIcon}><VscGitPullRequest /></div>
              <span className={styles.menuItemText}>{b} {b === localActiveBranch && "✓"}</span>
            </div>
          ))}

          <div className={styles.dropdownDivider} />
          <div
            className={styles.menuItem}
            onClick={handleNewBranchItem}
          >
            <div className={styles.menuItemIcon}><VscAdd /></div>
            <span className={styles.menuItemText}>New Branch...</span>
          </div>

          <div
            className={styles.menuItem}
            onClick={() => {
              closeDropdowns();
              onCloneVcs?.();
            }}
          >
            <div className={styles.menuItemIcon}><VscGitPullRequest /></div>
            <span className={styles.menuItemText}>Clone Repository...</span>
          </div>
        </div>
      )}

      {/* ── Dropdown 3: Hamburger Main Menu (Collapses traditional menu bar) ── */}
      {activeDropdown === "hamburger" && (
        <div className={`${styles.dropdownMenu} ${styles.hamburgerDropdown}`}>
          {/* File Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("file")}
          >
            <span className={styles.menuItemText}>File</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "file" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNewFile?.(); }}>
                  <span className={styles.menuItemText}>New File</span>
                  <span className={styles.menuItemShortcut}>Ctrl+N</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNewPhysicalFile?.(); }}>
                  <span className={styles.menuItemText}>New Physical File...</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Alt+Win+N</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNewWindow?.(); }}>
                  <span className={styles.menuItemText}>New Window</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Shift+N</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNewProject?.(); }}>
                  <span className={styles.menuItemText}>New Project...</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onOpenFile?.(); }}>
                  <span className={styles.menuItemText}>Open File...</span>
                  <span className={styles.menuItemShortcut}>Ctrl+O</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onOpenFolder?.(); }}>
                  <span className={styles.menuItemText}>Open Folder...</span>
                  <span className={styles.menuItemShortcut}>Ctrl+K Ctrl+O</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onAddFolderToWorkspace?.(); }}>
                  <span className={styles.menuItemText}>Add Folder to Workspace...</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onSaveWorkspaceAs?.(); }}>
                  <span className={styles.menuItemText}>Save Workspace As...</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onDuplicateWorkspace?.(); }}>
                  <span className={styles.menuItemText}>Duplicate Workspace</span>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onSave?.(); }}>
                  <span className={styles.menuItemText}>Save</span>
                  <span className={styles.menuItemShortcut}>Ctrl+S</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onSaveAs?.(); }}>
                  <span className={styles.menuItemText}>Save As...</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Shift+S</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onSaveAll?.(); }}>
                  <span className={styles.menuItemText}>Save All</span>
                  <span className={styles.menuItemShortcut}>Ctrl+K S</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onRevertFile?.(); }}>
                  <span className={styles.menuItemText}>Revert File</span>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCloseEditor?.(); }}>
                  <span className={styles.menuItemText}>Close Editor</span>
                  <span className={styles.menuItemShortcut}>Ctrl+W</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCloseFolder?.(); }}>
                  <span className={styles.menuItemText}>Close Folder</span>
                  <span className={styles.menuItemShortcut}>Ctrl+K F</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCloseWindow?.(); }}>
                  <span className={styles.menuItemText}>Close Window</span>
                  <span className={styles.menuItemShortcut}>Alt+F4</span>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onExitToWorkspace?.(); }}>
                  <div className={styles.menuItemIcon}><VscSignOut /></div>
                  <span className={styles.menuItemText}>Exit to Workspace Panel</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onExit?.(); }}>
                  <span className={styles.menuItemText}>Exit</span>
                  <span className={styles.menuItemShortcut}>Alt+F4</span>
                </div>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("edit")}
          >
            <span className={styles.menuItemText}>Edit</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "edit" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onUndo?.(); }}>
                  <span className={styles.menuItemText}>Undo</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Z</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onRedo?.(); }}>
                  <span className={styles.menuItemText}>Redo</span>
                  <span className={styles.menuItemShortcut}>Ctrl+Y</span>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCut?.(); }}>
                  <span className={styles.menuItemText}>Cut</span>
                  <span className={styles.menuItemShortcut}>Ctrl+X</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCopy?.(); }}>
                  <span className={styles.menuItemText}>Copy</span>
                  <span className={styles.menuItemShortcut}>Ctrl+C</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onPaste?.(); }}>
                  <span className={styles.menuItemText}>Paste</span>
                  <span className={styles.menuItemShortcut}>Ctrl+V</span>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onFind?.(); }}>
                  <span className={styles.menuItemText}>Find</span>
                  <span className={styles.menuItemShortcut}>Ctrl+F</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onReplace?.(); }}>
                  <span className={styles.menuItemText}>Replace</span>
                  <span className={styles.menuItemShortcut}>Ctrl+H</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onSelectAll?.(); }}>
                  <span className={styles.menuItemText}>Select All</span>
                  <span className={styles.menuItemShortcut}>Ctrl+A</span>
                </div>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("view")}
          >
            <span className={styles.menuItemText}>View</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "view" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); }}>
                  <span className={styles.menuItemText}>Toggle Primary Side Bar</span>
                  <span className={styles.menuItemShortcut}>Ctrl+B</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onToggleTerminal?.(); }}>
                  <span className={styles.menuItemText}>Toggle Integrated Terminal</span>
                  <span className={styles.menuItemShortcut}>Ctrl+`</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onOpenSearchEverywhere?.(); }}>
                  <span className={styles.menuItemText}>Search Everywhere...</span>
                  <span className={styles.menuItemShortcut}>Double Shift</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigate Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("navigate")}
          >
            <span className={styles.menuItemText}>Navigate</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "navigate" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onOpenSearchEverywhere?.(); }}>
                  <span className={styles.menuItemText}>Search Everywhere...</span>
                  <span className={styles.menuItemShortcut}>Double Shift</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNavigateBack?.(); }}>
                  <span className={styles.menuItemText}>Back</span>
                  <span className={styles.menuItemShortcut}>Alt+Left</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNavigateForward?.(); }}>
                  <span className={styles.menuItemText}>Forward</span>
                  <span className={styles.menuItemShortcut}>Alt+Right</span>
                </div>
              </div>
            )}
          </div>

          {/* Git Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("git")}
          >
            <span className={styles.menuItemText}>Git</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "git" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onCloneVcs?.(); }}>
                  <span className={styles.menuItemText}>Clone Repository...</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onNewBranch?.(); }}>
                  <span className={styles.menuItemText}>New Branch...</span>
                </div>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div
            className={styles.menuItem}
            onMouseEnter={() => setActiveSubmenu("help")}
          >
            <span className={styles.menuItemText}>Help</span>
            <VscChevronRight className={styles.menuItemShortcut} />

            {activeSubmenu === "help" && (
              <div className={styles.submenu}>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); onExitToWorkspace?.(); }}>
                  <span className={styles.menuItemText}>Welcome & Project Launcher</span>
                </div>
                <div className={styles.menuItem} onClick={() => { closeDropdowns(); }}>
                  <span className={styles.menuItemText}>About Pomai Studio Rust IDE</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
    
    {/* Settings Panel */}
    {isSettingsOpen && <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
});

export default Navbar;
