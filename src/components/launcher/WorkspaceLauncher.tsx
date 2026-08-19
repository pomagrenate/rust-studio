import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VscFolder,
  VscFolderOpened,
  VscAdd,
  VscGitPullRequest,
  VscSearch,
  VscClose,
  VscPackage,
  VscCode
} from "react-icons/vsc";
import { ProjectWizard } from "../wizard/ProjectWizard";
import { type ThemeId } from "../../hooks/useTheme";
import styles from "./WorkspaceLauncher.module.css";

interface RecentlyOpenedResult {
  workspaces: string[];
  files: string[];
}

interface WorkspaceLauncherProps {
  onOpenWorkspace: (path: string) => void;
  theme: ThemeId;
  onToggleTheme: () => void;
}

type LauncherTab = "projects" | "new";

export function WorkspaceLauncher({ onOpenWorkspace, theme, onToggleTheme }: WorkspaceLauncherProps) {
  const [activeTab, setActiveTab] = useState<LauncherTab>("projects");
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // VCS Modal State
  const [isVcsModalOpen, setIsVcsModalOpen] = useState(false);
  const [vcsUrl, setVcsUrl] = useState("");
  const [vcsLocation, setVcsLocation] = useState("C:\\Projects");
  const [isCloning, setIsCloning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  const filteredWorkspaces = recentWorkspaces.filter((w) => {
    const name = w.split(/[/\\]/).pop() || w;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className={styles.launcherContainer}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.brandHeader}>
          <div className={styles.brandIconBox}>
            <VscCode />
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

            {/* Search Bar */}
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

            {/* Project List */}
            {filteredWorkspaces.length > 0 ? (
              <div className={styles.projectListScroll}>
                {filteredWorkspaces.map((path) => {
                  const name = path.split(/[/\\]/).pop() || path;
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
                          <span className={styles.projectName}>{name}</span>
                          <span className={styles.projectPath}>{path}</span>
                        </div>
                      </div>
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => handleRemoveRecent(e, path)}
                        title="Remove from Recents"
                      >
                        <VscClose />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyProjectsBox}>
                <VscFolderOpened size={36} color="#8c959f" />
                <span>
                  {searchQuery
                    ? "No matching projects found."
                    : "No recent projects yet. Create a new Rust project or open an existing directory."}
                </span>
                <button className={styles.primaryActionBtn} onClick={() => setActiveTab("new")}>
                  <VscAdd />
                  <span>Create First Project</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Rich Framework Templates Project Wizard */
          <ProjectWizard
            onProjectCreated={(path) => onOpenWorkspace(path)}
            onCancel={() => setActiveTab("projects")}
          />
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

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Git Repository URL</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={vcsUrl}
                  onChange={(e) => setVcsUrl(e.target.value)}
                  placeholder="https://github.com/username/repository.git"
                  autoFocus
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
