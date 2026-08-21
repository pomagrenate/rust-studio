import appIcon from "../../../src-tauri/icons/128x128.png";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  VscFolder,
  VscFolderOpened,
  VscAdd,
  VscGitPullRequest,
  VscSearch,
  VscClose,
  VscPackage,
  VscCode,
  VscStarFull,
  VscStarEmpty,
  VscBook,
  VscTag,
  VscTerminal,
  VscSymbolClass,
  VscArchive,
  VscChromeMinimize,
  VscChromeMaximize,
  VscChromeClose
} from "react-icons/vsc";
import { ProjectWizard } from "../wizard/ProjectWizard";
import { KeybindingsSettings } from "../settings/KeybindingsSettings";
import { type ThemeId } from "../../hooks/useTheme";
import styles from "./WorkspaceLauncher.module.css";

interface RecentlyOpenedResult {
  workspaces: string[];
  files: string[];
}

interface UserRepoItem {
  name: string;
  full_name: string;
  clone_url: string;
  is_private: boolean;
  description?: string;
}

interface WorkspaceLauncherProps {
  onOpenWorkspace: (path: string) => void;
  theme: ThemeId;
  onToggleTheme: () => void;
}

type LauncherTab = "projects" | "new" | "learn";

function getProjectTag(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("tauri")) return "Tauri";
  if (lower.includes("rust") || lower.includes("cargo") || lower.includes("studio")) return "Rust";
  if (lower.includes("react") || lower.includes("next") || lower.includes("vite") || lower.includes("web")) return "React / Web";
  return "Rust";
}

export function WorkspaceLauncher({ onOpenWorkspace, theme, onToggleTheme }: WorkspaceLauncherProps) {
  const [activeTab, setActiveTab] = useState<LauncherTab>("projects");
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("All");

  // Pinned Workspaces
  const [pinnedWorkspaces, setPinnedWorkspaces] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pm-pinned-workspaces");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // VCS Modal State
  const [isVcsModalOpen, setIsVcsModalOpen] = useState(false);
  const [vcsUrl, setVcsUrl] = useState("");
  const [vcsLocation, setVcsLocation] = useState("C:\\Projects");
  const [isCloning, setIsCloning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Live GitHub Repos state
  const [userRepos, setUserRepos] = useState<UserRepoItem[]>([]);
  const [isLoadingUserRepos, setIsLoadingUserRepos] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);

  const loadRecents = useCallback(async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<RecentlyOpenedResult>("get_recently_opened");
        setRecentWorkspaces(res.workspaces || []);
      } else {
        setRecentWorkspaces([
          "E:\\GithubProjects\\pomai-studio",
          "C:\\Projects\\rust-game-server",
        ]);
      }
    } catch (e) {
      console.error("Failed to load recents:", e);
    }
  }, []);

  useEffect(() => {
    loadRecents();
  }, [loadRecents]);

  // Load real GitHub repositories if authenticated
  useEffect(() => {
    if (!isVcsModalOpen) return;
    
    async function loadGithubRepos() {
      setIsLoadingUserRepos(true);
      try {
        if (window.__TAURI_INTERNALS__) {
          const token = await invoke<string | null>("get_github_token");
          if (token) {
            setHasGithubToken(true);
            const repos = await invoke<UserRepoItem[]>("github_list_user_repos");
            setUserRepos(repos || []);
          } else {
            setHasGithubToken(false);
          }
        }
      } catch (err) {
        console.error("Failed to load GitHub user repos:", err);
      } finally {
        setIsLoadingUserRepos(false);
      }
    }

    loadGithubRepos();
  }, [isVcsModalOpen]);

  const handleOpenFolderDialog = async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Workspace Folder",
        });
        if (selected && typeof selected === "string") {
          await invoke("add_recently_opened", { path: selected, isFolder: true });
          onOpenWorkspace(selected);
        }
      } else {
        onOpenWorkspace("E:\\GithubProjects\\pomai-studio");
      }
    } catch (e) {
      console.error("Failed to open folder dialog:", e);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      if (window.__TAURI_INTERNALS__) {
        await invoke("remove_recently_opened", { path });
      }
      setRecentWorkspaces((prev) => prev.filter((p) => p !== path));
    } catch (err) {
      console.error("Failed to remove recent:", err);
    }
  };

  const handleBrowseLocation = async (setter: (val: string) => void) => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Directory",
        });
        if (selected && typeof selected === "string") {
          setter(selected);
        }
      }
    } catch (e) {
      console.error("Browse failed:", e);
    }
  };

  const handleCloneVcs = async () => {
    if (!vcsUrl.trim() || !vcsLocation.trim()) return;
    setIsCloning(true);
    setErrorMessage("");
    try {
      if (window.__TAURI_INTERNALS__) {
        const clonedPath = await invoke<string>("git_clone_project", {
          targetParentDir: vcsLocation.trim(),
          repoUrl: vcsUrl.trim(),
        });
        await invoke("add_recently_opened", { path: clonedPath, isFolder: true });
        setIsVcsModalOpen(false);
        onOpenWorkspace(clonedPath);
      } else {
        setIsVcsModalOpen(false);
        onOpenWorkspace(`${vcsLocation}\\cloned-project`);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsCloning(false);
    }
  };

  const togglePinWorkspace = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setPinnedWorkspaces((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path];
      localStorage.setItem("pm-pinned-workspaces", JSON.stringify(next));
      return next;
    });
  };

  const filteredWorkspaces = recentWorkspaces
    .filter((w) => {
      const name = w.split(/[/\\]/).pop() || w;
      const matchesSearch =
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (selectedFilter === "Pinned") {
        return pinnedWorkspaces.includes(w);
      } else if (selectedFilter !== "All") {
        const tag = getProjectTag(w);
        return tag === selectedFilter;
      }
      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedWorkspaces.includes(a) ? 1 : 0;
      const bPinned = pinnedWorkspaces.includes(b) ? 1 : 0;
      return bPinned - aPinned;
    });

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
    <div className={styles.launcherContainer}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.brandHeader}>
          <div className={styles.brandIconBox}>
            <img src={appIcon} alt="Pomai Studio Logo" style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 4 }} />
          </div>
          <div className={styles.brandTitles}>
            <span className={styles.brandName}>Pomai Studio</span>
            <span className={styles.brandSubtitle}>Rust IDE</span>
          </div>
        </div>

        <nav className={styles.navMenu}>
          <button
            className={`${styles.navItem} ${activeTab === "projects" ? styles.navItemActive : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            <VscFolderOpened />
            <span>Projects</span>
          </button>

          <button
            className={`${styles.navItem} ${activeTab === "new" ? styles.navItemActive : ""}`}
            onClick={() => setActiveTab("new")}
          >
            <VscAdd />
            <span>New Project</span>
          </button>

          <button
            className={`${styles.navItem} ${activeTab === "learn" ? styles.navItemActive : ""}`}
            onClick={() => setActiveTab("learn")}
          >
            <VscBook />
            <span>Learn & Shortcuts</span>
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.themeToggleBtn}
            onClick={onToggleTheme}
            title={`Switch theme (current: ${theme})`}
          >
            {theme === "light" ? "☽ Dark" : theme === "dark" ? "☀ Light" : "⟲ System"}
          </button>
          <span>Pomai Studio v0.1.0</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={styles.mainArea}>
        {/* Top Window Controls */}
        <div className={styles.topWindowControls}>
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
            title="Close Program"
          >
            <VscChromeClose />
          </button>
        </div>
        {activeTab === "projects" ? (
          <div className={styles.projectsContainer}>
            {/* Header with Title & Action Buttons */}
            <div className={styles.projectsHeader}>
              <span className={styles.projectsTitle}>Projects</span>

              <div className={styles.topActions}>
                <button
                  className={styles.primaryActionBtn}
                  onClick={() => setActiveTab("new")}
                >
                  <VscAdd />
                  <span>New Project</span>
                </button>
                <button
                  className={styles.secondaryActionBtn}
                  onClick={handleOpenFolderDialog}
                >
                  <VscFolder />
                  <span>Open</span>
                </button>
                <button
                  className={styles.secondaryActionBtn}
                  onClick={() => {
                    setErrorMessage("");
                    setIsVcsModalOpen(true);
                  }}
                >
                  <VscGitPullRequest />
                  <span>Get from VCS</span>
                </button>
              </div>
            </div>

            {/* Search Bar & Filter Pills */}
            <div className={styles.searchBarWrapper}>
              <VscSearch className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search recent projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.filterPillsBar}>
              {["All", "Pinned", "Rust", "Tauri", "React / Web"].map((filter) => (
                <button
                  key={filter}
                  className={`${styles.filterPill} ${selectedFilter === filter ? styles.filterPillActive : ""}`}
                  onClick={() => setSelectedFilter(filter)}
                >
                  {filter === "Pinned" && <VscStarFull style={{ color: selectedFilter === "Pinned" ? "#fff" : "#e58e26" }} />}
                  <span>{filter}</span>
                  {filter === "Pinned" && pinnedWorkspaces.length > 0 && (
                    <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 2 }}>({pinnedWorkspaces.length})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Project List */}
            {filteredWorkspaces.length > 0 ? (
              <div className={styles.projectListScroll}>
                {filteredWorkspaces.map((path) => {
                  const name = path.split(/[/\\]/).pop() || path;
                  const isPinned = pinnedWorkspaces.includes(path);
                  const tag = getProjectTag(path);

                  return (
                    <div
                      key={path}
                      className={styles.projectRow}
                      onClick={() => onOpenWorkspace(path)}
                      title={`Open ${path}`}
                    >
                      <div className={styles.projectLeft}>
                        <div className={styles.projectRustBadge}>
                          <VscPackage />
                        </div>
                        <div className={styles.projectText}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span className={styles.projectName}>{name}</span>
                            <span className={styles.techTag}>{tag}</span>
                          </div>
                          <span className={styles.projectPath}>{path}</span>
                        </div>
                      </div>

                      <div className={styles.projectActionsRight}>
                        <button
                          className={`${styles.pinBtn} ${isPinned ? styles.pinBtnActive : ""}`}
                          onClick={(e) => togglePinWorkspace(e, path)}
                          title={isPinned ? "Unpin project" : "Pin project to top"}
                        >
                          {isPinned ? <VscStarFull /> : <VscStarEmpty />}
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={(e) => handleRemoveRecent(e, path)}
                          title="Remove from Recents"
                        >
                          <VscClose />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyProjectsBox}>
                <VscFolderOpened size={36} color="#8c959f" />
                <span>
                  {searchQuery || selectedFilter !== "All"
                    ? "No matching projects found for filter/search."
                    : "No recent projects yet. Create a new Rust project or open an existing directory."}
                </span>
                <button className={styles.primaryActionBtn} onClick={() => setActiveTab("new")}>
                  <VscAdd />
                  <span>Create First Project</span>
                </button>
              </div>
            )}
          </div>
        ) : activeTab === "new" ? (
          /* Rich Framework Templates Project Wizard */
          <ProjectWizard
            onProjectCreated={(path) => onOpenWorkspace(path)}
            onCancel={() => setActiveTab("projects")}
          />
        ) : (
          /* Learn & Keyboard Shortcuts Tab */
          <div className={styles.learnContainer}>
            <div className={styles.learnHeader}>
              <span className={styles.learnTitle}>Learn & Keyboard Shortcuts</span>
              <span className={styles.learnSubtitle}>
                Master Pomai Studio with keyboard shortcuts, CodeWiki architecture graphs, and local code backups.
              </span>
            </div>
            <KeybindingsSettings />
          </div>
        )}
      </div>

      {/* ── Modal Dialog for Get from VCS ── */}
      {isVcsModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsVcsModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <VscGitPullRequest color="#0969da" />
                <span>Clone Repository from VCS</span>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setIsVcsModalOpen(false)}
              >
                <VscClose />
              </button>
            </div>

            <div className={styles.modalBody}>
              {errorMessage && (
                <div className={styles.errorBanner}>
                  {errorMessage}
                </div>
              )}

              {hasGithubToken && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Select from Your GitHub Repositories
                    {isLoadingUserRepos && <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>(Loading...)</span>}
                  </label>
                  <select
                    className={styles.formInput}
                    onChange={(e) => {
                      if (e.target.value) {
                        setVcsUrl(e.target.value);
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>-- Choose a repository from your GitHub account --</option>
                    {userRepos.map((repo) => (
                      <option key={repo.full_name} value={repo.clone_url}>
                        {repo.full_name} {repo.is_private ? "🔒 (Private)" : "🌐 (Public)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Git Repository URL</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={vcsUrl}
                  onChange={(e) => setVcsUrl(e.target.value)}
                  placeholder="https://github.com/username/repository.git"
                  autoFocus={!hasGithubToken}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target Directory</label>
                <div className={styles.inputBrowseGroup}>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ flex: 1 }}
                    value={vcsLocation}
                    onChange={(e) => setVcsLocation(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={() => handleBrowseLocation(setVcsLocation)}
                  >
                    Browse...
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryActionBtn}
                onClick={() => setIsVcsModalOpen(false)}
                disabled={isCloning}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryActionBtn}
                onClick={handleCloneVcs}
                disabled={isCloning}
              >
                <span>{isCloning ? "Cloning..." : "Clone & Open"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceLauncher;
