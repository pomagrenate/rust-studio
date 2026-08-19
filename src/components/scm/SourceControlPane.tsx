import { useState, useEffect, useRef } from "react";
import {
  VscGitBranch,
  VscSync,
  VscRefresh,
  VscEllipsis,
  VscChevronRight,
  VscChevronDown,
  VscAdd,
  VscRemove,
  VscDiscard,
  VscGoToFile,
  VscCloud,
  VscTarget,
  VscArrowDown,
  VscArrowUp,
  VscSparkle,
  VscGithub,
  VscKey,
  VscGitPullRequest,
  VscIssues,
} from "react-icons/vsc";
import { extensionRegistry } from "../../extensions/extensionRegistry";
import { ISCMRepository, ISCMRepositoryState } from "../../extensions/types";
import { GitHubAuthDialog } from "../github/GitHubAuthDialog";
import { PullRequestsPanel } from "../github/PullRequestsPanel";
import { IssuesPanel } from "../github/IssuesPanel";
import { githubGetToken } from "../../ipc/github";
import styles from "./SourceControlPane.module.css";

interface SourceControlPaneProps {
  workspaceRoots: string[];
  onOpenFile?: (path: string) => void;
  onStatusChange?: (totalChanges: number) => void;
}

export function SourceControlPane({
  workspaceRoots,
  onOpenFile,
  onStatusChange,
}: SourceControlPaneProps) {
  const [repo, setRepo] = useState<ISCMRepository | null>(null);
  const [repoState, setRepoState] = useState<ISCMRepositoryState>({
    isRepo: false,
    branch: "main",
    ahead: 0,
    behind: 0,
    stagedChanges: [],
    unstagedChanges: [],
    history: [],
    isLoading: false,
  });

  const [commitMessage, setCommitMessage] = useState("");
  const [isChangesExpanded, setIsChangesExpanded] = useState(true);
  const [isGraphExpanded, setIsGraphExpanded] = useState(true);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isGitHubExpanded, setIsGitHubExpanded] = useState(false);
  const [gitHubTab, setGitHubTab] = useState<"prs" | "issues">("prs");
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [hasGitHubToken, setHasGitHubToken] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const repoPath = workspaceRoots[0] || "";

  // Close more menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isMoreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMoreMenuOpen]);

  // Acquire active SCM repository from extensionRegistry and subscribe to reactive state
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    async function initRepo() {
      if (!repoPath) {
        setRepo(null);
        return;
      }
      const activeRepo = await extensionRegistry.getRepositoryForWorkspace(repoPath);
      if (isCancelled) return;

      setRepo(activeRepo);
      if (activeRepo) {
        unsubscribe = activeRepo.subscribe((nextState) => {
          setRepoState(nextState);
          const total = nextState.stagedChanges.length + nextState.unstagedChanges.length;
          onStatusChange?.(total);
        });
      }
    }

    initRepo();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [repoPath, onStatusChange]);

  // Check for GitHub token
  useEffect(() => {
    async function checkToken() {
      try {
        const token = await githubGetToken();
        setHasGitHubToken(token !== null);
      } catch {
        setHasGitHubToken(false);
      }
    }
    checkToken();
  }, []);

  const handleStageFile = (filePath: string) => {
    repo?.stage([filePath]);
  };

  const handleUnstageFile = (filePath: string) => {
    repo?.unstage([filePath]);
  };

  const handleStageAll = () => {
    repo?.stageAll();
  };

  const handleUnstageAll = () => {
    repo?.unstageAll();
  };

  const handleDiscardFile = (filePath: string) => {
    repo?.discard([filePath]);
  };

  const handleDiscardAll = () => {
    repo?.discardAll();
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await repo?.commit(commitMessage.trim());
    setCommitMessage("");
  };

  const handleSync = () => {
    repo?.sync();
  };

  const handleInitRepo = () => {
    repo?.initRepo();
  };

  const stagedCount = repoState.stagedChanges.length;
  const unstagedCount = repoState.unstagedChanges.length;
  const totalChangesCount = stagedCount + unstagedCount;

  const branchName = repoState.branch || "main";
  const behindCount = repoState.behind;
  const aheadCount = repoState.ahead;
  const isLoading = repoState.isLoading;

  if (!repoState.isRepo) {
    return (
      <div className={styles.scmPane}>
        <div className={styles.header}>
          <span>Source Control</span>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyText}>
            The folder currently open doesn&apos;t have a Git repository. You can initialize a repository which will enable source control features powered by Git.
          </div>
          <button className={styles.primaryBtn} onClick={handleInitRepo}>
            Initialize Repository
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scmPane}>
      {/* SCM Header */}
      <div className={styles.header}>
        <span>Source Control</span>

        <div className={styles.headerActions} ref={moreMenuRef}>
          <button
            className={styles.headerBtn}
            title="More Actions..."
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
          >
            <VscEllipsis />
          </button>

          {isMoreMenuOpen && (
            <div className={styles.dropdownMenu}>
              <button className={styles.menuItem} onClick={() => { handleStageAll(); setIsMoreMenuOpen(false); }}>
                <span>Stage All Changes</span>
              </button>
              <button className={styles.menuItem} onClick={() => { handleUnstageAll(); setIsMoreMenuOpen(false); }}>
                <span>Unstage All Changes</span>
              </button>
              <div className={styles.menuDivider} />
              <button className={styles.menuItem} onClick={() => { handleSync(); setIsMoreMenuOpen(false); }}>
                <span>Pull, Push</span>
              </button>
              <button className={styles.menuItem} onClick={() => { repo?.refresh(); setIsMoreMenuOpen(false); }}>
                <span>Fetch</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Section: Changes & Commit */}
      <div className={styles.topSection}>
        {/* Collapsible CHANGES header */}
        <div
          className={styles.sectionHeader}
          onClick={() => setIsChangesExpanded(!isChangesExpanded)}
        >
          {isChangesExpanded ? <VscChevronDown /> : <VscChevronRight />}
          <div className={styles.sectionTitle}>
            <span>Changes</span>
            {totalChangesCount > 0 && (
              <span className={styles.countBadge}>{totalChangesCount}</span>
            )}
          </div>
          {totalChangesCount > 0 && (
            <div className={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.headerBtn}
                title="Discard All Changes"
                onClick={handleDiscardAll}
              >
                <VscDiscard />
              </button>
              <button
                className={styles.headerBtn}
                title="Stage All Changes"
                onClick={handleStageAll}
              >
                <VscAdd />
              </button>
            </div>
          )}
        </div>

        {/* Input box */}
        <div className={styles.commitInputWrapper}>
          <input
            className={styles.commitInput}
            type="text"
            placeholder={`Message (Ctrl+Enter to commit on "${branchName}"...)`}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <span className={styles.inputSparkle}>
            <VscSparkle />
          </span>
        </div>

        {/* Primary Action Button (Sync Changes or Commit) */}
        {commitMessage.trim() ? (
          <button
            className={styles.primarySyncBtn}
            onClick={handleCommit}
          >
            <span>Commit on &quot;{branchName}&quot;</span>
          </button>
        ) : (
          <button
            className={styles.primarySyncBtn}
            onClick={handleSync}
            title="Synchronize Changes with remote"
            disabled={isLoading}
          >
            <VscSync style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
            <span>
              Sync Changes {behindCount > 0 ? `${behindCount}↓` : ""}{aheadCount > 0 ? `${aheadCount}↑` : ""}
            </span>
          </button>
        )}

        {/* File lists when expanded and changes exist */}
        {isChangesExpanded && totalChangesCount > 0 && (
          <div className={styles.fileListArea}>
            {/* Staged */}
            {stagedCount > 0 && (
              <div>
                {repoState.stagedChanges.map((file) => (
                  <div
                    key={`staged-${file.path}`}
                    className={styles.fileRow}
                    onClick={() => onOpenFile?.(`${repoPath}/${file.path}`)}
                    title={`${file.path} (${file.status})`}
                  >
                    <span className={styles.fileName}>{file.filename}</span>
                    <span className={styles.filePath}>{file.path}</span>
                    <span className={`${styles.statusBadge} ${styles[`status${file.status}`] || ""}`}>
                      {file.status}
                    </span>
                    <div className={styles.fileActions} onClick={(e) => e.stopPropagation()}>
                      <button
                        className={styles.rowActionBtn}
                        title="Open File"
                        onClick={() => onOpenFile?.(`${repoPath}/${file.path}`)}
                      >
                        <VscGoToFile />
                      </button>
                      <button
                        className={styles.rowActionBtn}
                        title="Unstage Changes"
                        onClick={() => handleUnstageFile(file.path)}
                      >
                        <VscRemove />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unstaged */}
            {repoState.unstagedChanges.map((file) => (
              <div
                key={`unstaged-${file.path}`}
                className={styles.fileRow}
                onClick={() => onOpenFile?.(`${repoPath}/${file.path}`)}
                title={`${file.path} (${file.status})`}
              >
                <span className={styles.fileName}>{file.filename}</span>
                <span className={styles.filePath}>{file.path}</span>
                <span className={`${styles.statusBadge} ${styles[`status${file.status}`] || ""}`}>
                  {file.status}
                </span>
                <div className={styles.fileActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.rowActionBtn}
                    title="Open File"
                    onClick={() => onOpenFile?.(`${repoPath}/${file.path}`)}
                  >
                    <VscGoToFile />
                  </button>
                  <button
                    className={styles.rowActionBtn}
                    title="Discard Changes"
                    onClick={() => handleDiscardFile(file.path)}
                  >
                    <VscDiscard />
                  </button>
                  <button
                    className={styles.rowActionBtn}
                    title="Stage Changes"
                    onClick={() => handleStageFile(file.path)}
                  >
                    <VscAdd />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Section: GRAPH */}
      <div className={styles.graphContainer}>
        <div
          className={styles.graphHeader}
          onClick={() => setIsGraphExpanded(!isGraphExpanded)}
        >
          <div className={styles.graphTitle}>
            {isGraphExpanded ? <VscChevronDown /> : <VscChevronRight />}
            <span>Graph</span>
          </div>

          <div className={styles.graphActions} onClick={(e) => e.stopPropagation()}>
            <button className={styles.graphActionPill} title="Branch filter mode: Auto">
              <VscGitBranch />
              <span>Auto</span>
            </button>
            <button className={styles.headerBtn} title="Focus Head">
              <VscTarget />
            </button>
            <button className={styles.headerBtn} title="Incoming Changes">
              <VscArrowDown />
            </button>
            <button className={styles.headerBtn} title="Outgoing Changes">
              <VscArrowUp />
            </button>
            <button
              className={styles.headerBtn}
              title="Refresh Graph"
              onClick={() => repo?.refresh()}
            >
              <VscRefresh style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button className={styles.headerBtn} title="More Actions">
              <VscEllipsis />
            </button>
          </div>
        </div>

        {/* Graph Nodes Body */}
        {isGraphExpanded && (
          <div className={styles.graphScrollArea}>
            {repoState.history.map((node, index) => {
              const isFirst = index === 0;
              const isLast = index === repoState.history.length - 1;

              return (
                <div
                  key={`${node.hash}-${index}`}
                  className={styles.graphNodeRow}
                  title={`${node.message}\n${node.author} • ${node.relativeDate}\n${node.hash}`}
                >
                  {/* Track Column with Purple Node Circle & Connecting Lines */}
                  <div className={styles.graphTrackCol}>
                    {!isFirst && <div className={styles.graphTrackLineTop} />}
                    {!isLast && <div className={styles.graphTrackLineBottom} />}
                    <div
                      className={`${styles.graphDot} ${node.isHead ? styles.graphDotHead : ""}`}
                    />
                  </div>

                  {/* Message */}
                  <span className={styles.graphMessage}>{node.message}</span>

                  {/* Remote Ref Badge (e.g. origin/main) */}
                  {node.remoteRef && (
                    <span className={styles.remoteRefBadge}>
                      <VscCloud />
                      <span>{node.remoteRef}</span>
                    </span>
                  )}

                  {/* Local Ref Badge */}
                  {!node.remoteRef && node.localRef && (
                    <span className={styles.localRefBadge}>
                      <VscGitBranch />
                      <span>{node.localRef}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GitHub Integration Section */}
      <div className={styles.githubSection}>
        <div
          className={styles.sectionHeader}
          onClick={() => setIsGitHubExpanded(!isGitHubExpanded)}
        >
          <div className={styles.sectionHeaderLeft}>
            {isGitHubExpanded ? <VscChevronDown /> : <VscChevronRight />}
            <VscGithub />
            <span>GitHub</span>
            {hasGitHubToken && (
              <span className={styles.authenticatedBadge}>
                <VscKey />
                Authenticated
              </span>
            )}
          </div>
          {!hasGitHubToken && (
            <button
              className={styles.authButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsAuthDialogOpen(true);
              }}
              title="Authenticate with GitHub"
            >
              <VscKey />
              Sign In
            </button>
          )}
        </div>

        {isGitHubExpanded && hasGitHubToken && (
          <div className={styles.githubContent}>
            <div className={styles.githubTabs}>
              <button
                className={`${styles.githubTab} ${gitHubTab === "prs" ? styles.githubTabActive : ""}`}
                onClick={() => setGitHubTab("prs")}
              >
                <VscGitPullRequest />
                Pull Requests
              </button>
              <button
                className={`${styles.githubTab} ${gitHubTab === "issues" ? styles.githubTabActive : ""}`}
                onClick={() => setGitHubTab("issues")}
              >
                <VscIssues />
                Issues
              </button>
            </div>

            <div className={styles.githubPanelContainer}>
              {gitHubTab === "prs" && (
                <PullRequestsPanel repoPath={repoPath} currentBranch={branchName} />
              )}
              {gitHubTab === "issues" && <IssuesPanel repoPath={repoPath} />}
            </div>
          </div>
        )}

        {isGitHubExpanded && !hasGitHubToken && (
          <div className={styles.githubAuthPrompt}>
            <p>Sign in to GitHub to access Pull Requests and Issues</p>
            <button
              className={styles.primaryBtn}
              onClick={() => setIsAuthDialogOpen(true)}
            >
              <VscKey />
              Sign In with GitHub
            </button>
          </div>
        )}
      </div>

      <GitHubAuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        onAuthSuccess={() => {
          setHasGitHubToken(true);
          setIsGitHubExpanded(true);
        }}
      />
    </div>
  );
}

export default SourceControlPane;
