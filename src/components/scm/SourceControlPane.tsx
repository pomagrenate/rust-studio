import React, { useState, useEffect } from "react";
import styles from "./SourceControlPane.module.css";
import { GitSCMProvider, GitRepository } from "../../extensions/builtin/git/GitSCMProvider";
import { ISCMRepositoryState, ISCMResource, ISCMCommitDetail } from "../../extensions/types";
import { GitHubAuthDialog } from "../github/GitHubAuthDialog";
import { PullRequestsPanel } from "../github/PullRequestsPanel";
import { IssuesPanel } from "../github/IssuesPanel";
import { githubGetToken, githubClearToken, githubVerifyToken, GitHubUser } from "../../ipc/github";
import {
  VscRepo,
  VscGitBranch,
  VscSync,
  VscCloudDownload,
  VscCloudUpload,
  VscArchive,
  VscCheck,
  VscDiscard,
  VscAdd,
  VscHistory,
  VscGitPullRequest,
  VscIssues,
  VscCopy,
  VscAccount,
  VscClose,
  VscRefresh,
  VscLoading,
} from "react-icons/vsc";

interface ParsedDiffLine {
  type: "header" | "add" | "delete" | "normal";
  oldLineNo?: number;
  newLineNo?: number;
  content: string;
}

function parseUnifiedDiff(rawDiff: string): { lines: ParsedDiffLine[]; addCount: number; delCount: number } {
  if (!rawDiff || !rawDiff.trim()) return { lines: [], addCount: 0, delCount: 0 };

  const rawLines = rawDiff.split("\n");
  const lines: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let addCount = 0;
  let delCount = 0;

  for (const line of rawLines) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff --git") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({
        type: "header",
        content: line,
      });
    } else if (line.startsWith("+")) {
      addCount++;
      lines.push({
        type: "add",
        newLineNo: newLine++,
        content: line.slice(1),
      });
    } else if (line.startsWith("-")) {
      delCount++;
      lines.push({
        type: "delete",
        oldLineNo: oldLine++,
        content: line.slice(1),
      });
    } else {
      lines.push({
        type: "normal",
        oldLineNo: oldLine > 0 ? oldLine++ : undefined,
        newLineNo: newLine > 0 ? newLine++ : undefined,
        content: line.startsWith(" ") ? line.slice(1) : line,
      });
    }
  }

  return { lines, addCount, delCount };
}

interface SourceControlPaneProps {
  workspaceRoots: string[];
  onOpenFile?: (path: string) => void;
  onStatusChange?: (totalChanges: number) => void;
  onClose?: () => void;
}

export const SourceControlPane: React.FC<SourceControlPaneProps> = ({
  workspaceRoots,
  onOpenFile,
  onStatusChange,
  onClose,
}) => {
  const rootPath = workspaceRoots[0] || "";
  const repoName = rootPath ? rootPath.split(/[/\\]/).pop() || "Repository" : "No Repository";

  const [repo, setRepo] = useState<GitRepository | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const [scmState, setScmState] = useState<ISCMRepositoryState>({
    isRepo: false,
    branch: "main",
    ahead: 0,
    behind: 0,
    stagedChanges: [],
    unstagedChanges: [],
    conflictedChanges: [],
    hasConflicts: false,
    history: [],
    stashes: [],
    isLoading: false,
  });

  // UI State
  const [activeTab, setActiveTab] = useState<"changes" | "history" | "github">("changes");
  const [githubSubTab, setGithubSubTab] = useState<"prs" | "issues">("prs");
  
  // Selection
  const [selectedFile, setSelectedFile] = useState<ISCMResource | null>(null);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<ISCMCommitDetail | null>(null);

  // Commit Form State
  const [commitSummary, setCommitSummary] = useState("");
  const [commitDescription, setCommitDescription] = useState("");
  const [showCoAuthor, setShowCoAuthor] = useState(false);
  const [coAuthors, setCoAuthors] = useState("");

  // Branch Switcher Modal State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");

  // Stash State
  const [stashMessage, setStashMessage] = useState("");

  // Search Filter in History
  const [historySearch, setHistorySearch] = useState("");

  // GitHub Authentication
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);

  // Initialize Repo
  useEffect(() => {
    if (!rootPath) return;
    const provider = new GitSCMProvider();
    provider.createRepository(rootPath).then((r) => {
      if (r instanceof GitRepository) {
        setRepo(r);
        return r.subscribe((newState) => {
          setScmState(newState);
          const total = newState.stagedChanges.length + newState.unstagedChanges.length;
          onStatusChange?.(total);
        });
      }
    });
  }, [rootPath]);

  // Check GitHub Auth Status
  const checkAuthStatus = async (userParam?: GitHubUser) => {
    if (userParam && userParam.login) {
      setGhUser(userParam);
      return;
    }
    try {
      const token = await githubGetToken();
      if (token && token.trim().length > 0) {
        const user = await githubVerifyToken(token);
        setGhUser(user);
      } else {
        setGhUser(null);
      }
    } catch {
      setGhUser(null);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Fetch Branches when Modal opens
  useEffect(() => {
    if (isBranchModalOpen && repo) {
      repo.getBranches().then(setBranches);
    }
  }, [isBranchModalOpen, repo]);

  // Diff Viewer State
  const [diffText, setDiffText] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Load Diff when selectedFile changes
  useEffect(() => {
    if (selectedFile && repo) {
      setIsLoadingDiff(true);
      repo
        .getFileDiff(selectedFile.path, selectedFile.staged)
        .then((diff) => setDiffText(diff))
        .catch(() => setDiffText(""))
        .finally(() => setIsLoadingDiff(false));
    } else {
      setDiffText(null);
    }
  }, [selectedFile, repo]);

  // Load Commit Details when a historical commit is selected
  useEffect(() => {
    if (selectedCommitHash && repo) {
      repo.getCommitDetails(selectedCommitHash).then((detail) => setCommitDetail(detail));
    } else {
      setCommitDetail(null);
    }
  }, [selectedCommitHash, repo]);

  // Handlers
  const handleStageFile = async (path: string) => {
    await repo?.stage([path]);
  };

  const handleUnstageFile = async (path: string) => {
    await repo?.unstage([path]);
  };

  const handleDiscardFile = async (path: string) => {
    await repo?.discard([path]);
    setSelectedFile(null);
    setDiffText(null);
  };

  const handleCommit = async () => {
    if (!commitSummary.trim() || !repo) return;
    let fullMsg = commitSummary.trim();
    if (commitDescription.trim()) {
      fullMsg += `\n\n${commitDescription.trim()}`;
    }
    if (showCoAuthor && coAuthors.trim()) {
      fullMsg += `\n\nCo-authored-by: ${coAuthors.trim()}`;
    }
    await repo.commit(fullMsg);
    setCommitSummary("");
    setCommitDescription("");
    setCoAuthors("");
  };

  const handleSync = async () => {
    await repo?.sync();
  };

  const handleFetch = async () => {
    await repo?.fetch();
  };

  const handleStashSave = async () => {
    await repo?.stashSave(stashMessage || "Stashed changes from Pomai Studio");
    setStashMessage("");
  };

  const handleStashPop = async () => {
    await repo?.stashPop();
  };

  const handleCheckoutBranch = async (targetBranch: string) => {
    await repo?.checkoutBranch(targetBranch);
    setIsBranchModalOpen(false);
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    await repo?.createBranch(newBranchName.trim());
    await repo?.checkoutBranch(newBranchName.trim());
    setNewBranchName("");
    setIsBranchModalOpen(false);
  };

  const handleSignOut = async () => {
    await githubClearToken();
    setGhUser(null);
  };

  const handleCheckoutOurs = async (path: string) => {
    await repo?.checkoutOurs(path);
  };

  const handleCheckoutTheirs = async (path: string) => {
    await repo?.checkoutTheirs(path);
  };

  const handleAbortMerge = async () => {
    await repo?.abortMerge();
  };

  const totalChanges =
    (scmState.stagedChanges?.length || 0) +
    (scmState.unstagedChanges?.length || 0) +
    (scmState.conflictedChanges?.length || 0);

  const filteredHistory = scmState.history.filter(
    (item) =>
      item.message.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.author.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.hash.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div
      className={styles.workspaceModalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className={styles.workspaceModalContainer}>
        <div className={styles.desktopWorkspace}>
          {/* ── GitHub Desktop Top Bar ── */}
          <div className={styles.topBar}>
            <div className={styles.topBarLeft}>
              <div className={styles.repoBadge} title={`Root: ${rootPath}`}>
                <VscRepo /> {repoName}
              </div>

              <button
                className={styles.branchPickerBtn}
                onClick={() => setIsBranchModalOpen(true)}
                title="Switch or create branch"
              >
                <VscGitBranch />
                <span>{scmState.branch}</span>
                {(scmState.ahead > 0 || scmState.behind > 0) && (
                  <span className={styles.syncBadge}>
                    {scmState.behind > 0 && <><VscCloudDownload /> {scmState.behind}</>}
                    {scmState.ahead > 0 && <><VscCloudUpload /> {scmState.ahead}</>}
                  </span>
                )}
              </button>
            </div>

            <div className={styles.topBarRight}>
              <button
                className={styles.topSecondaryBtn}
                onClick={handleStashSave}
                disabled={totalChanges === 0}
                title="Stash uncommitted changes"
              >
                <VscArchive /> Stash
              </button>

              <button
                className={styles.topActionBtn}
                onClick={handleSync}
                disabled={scmState.isLoading}
                title="Sync with remote (Pull & Push)"
              >
                <VscSync className={scmState.isLoading ? styles.spinning : ""} />
                {scmState.ahead > 0 || scmState.behind > 0
                  ? `Sync (${scmState.ahead}↑ ${scmState.behind}↓)`
                  : "Fetch origin"}
              </button>

              {ghUser ? (
                <div className={styles.userPill}>
                  <VscAccount /> @{ghUser.login}
                  <button
                    className={styles.signOutBtn}
                    onClick={() => setIsAuthDialogOpen(true)}
                    title="Change or replace GitHub Personal Access Token"
                    style={{ color: "var(--pm-accent, #58a6ff)", fontWeight: 600 }}
                  >
                    Change Token
                  </button>
                  <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign Out of GitHub">
                    Sign Out
                  </button>
                </div>
              ) : (
                <button className={styles.topSecondaryBtn} onClick={() => setIsAuthDialogOpen(true)}>
                  <VscAccount /> Sign In
                </button>
              )}

              {onClose && (
                <button
                  className={styles.closeModalBtn}
                  onClick={onClose}
                  title="Close Source Control workspace (Esc)"
                >
                  <VscClose />
                </button>
              )}
            </div>
          </div>

      {/* ── Main Workspace Split Layout ── */}
      <div className={styles.mainWorkspaceBody}>
        {/* ── Left Navigation & Changes Panel ── */}
        <div className={styles.leftNavPanel}>
          {/* Tabs */}
          <div className={styles.tabHeader}>
            <button
              className={`${styles.tabBtn} ${activeTab === "changes" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("changes")}
            >
              Changes {totalChanges > 0 && <span className={styles.tabBadge}>{totalChanges}</span>}
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("history")}
            >
              <VscHistory /> History
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "github" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("github")}
            >
              <VscGitPullRequest /> GitHub
            </button>
          </div>

          {/* Conflict Banner Notification */}
          {(scmState.hasConflicts || (scmState.conflictedChanges && scmState.conflictedChanges.length > 0)) && (
            <div className={styles.conflictBanner}>
              <div className={styles.conflictBannerText}>
                ⚠️ Merge Conflict ({scmState.conflictedChanges?.length || 1} file)
              </div>
              <button className={styles.stashActionBtn} style={{ backgroundColor: "#f85149", color: "#ffffff" }} onClick={handleAbortMerge}>
                Abort Merge
              </button>
            </div>
          )}

          {/* Stash Banner Notification */}
          {scmState.stashes && scmState.stashes.length > 0 && (
            <div className={styles.stashBanner}>
              <div className={styles.stashBannerText}>
                <VscArchive /> Stashed changes available
              </div>
              <button className={styles.stashActionBtn} onClick={handleStashPop}>
                Restore
              </button>
            </div>
          )}

          {/* TAB 1: CHANGES VIEW */}
          {activeTab === "changes" && (
            <div className={styles.changesViewContainer}>
              <div className={styles.changesToolbar}>
                <span>Changed Files ({totalChanges})</span>
                <div className={styles.toolbarActions}>
                  <button className={styles.iconBtn} onClick={() => repo?.stageAll()} title="Stage All">
                    <VscAdd />
                  </button>
                  <button className={styles.iconBtn} onClick={() => repo?.discardAll()} title="Discard All">
                    <VscDiscard />
                  </button>
                  <button className={styles.iconBtn} onClick={() => repo?.refresh()} title="Refresh">
                    <VscRefresh />
                  </button>
                </div>
              </div>

              <div className={styles.fileListArea}>
                {totalChanges === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--pm-fg-subtle)" }}>
                    No uncommitted changes in workspace.
                  </div>
                ) : (
                  <>
                    {/* Conflicted Files */}
                    {scmState.conflictedChanges?.map((file) => (
                      <div
                        key={`conflicted-${file.path}`}
                        className={`${styles.fileRow} ${selectedFile?.path === file.path ? styles.fileRowSelected : ""}`}
                        onClick={() => setSelectedFile(file)}
                        style={{ backgroundColor: "rgba(248,81,73,0.1)" }}
                      >
                        <span className={styles.fileName} style={{ color: "#ff7b72" }}>{file.filename}</span>
                        <span className={styles.filePath}>{file.path}</span>
                        <span className={`${styles.statusBadge} ${styles.statusC}`}>
                          CONFLICT
                        </span>
                      </div>
                    ))}

                    {/* Staged Changes */}
                    {scmState.stagedChanges?.map((file) => (
                      <div
                        key={`staged-${file.path}`}
                        className={`${styles.fileRow} ${selectedFile?.path === file.path ? styles.fileRowSelected : ""}`}
                        onClick={() => setSelectedFile(file)}
                      >
                        <input
                          type="checkbox"
                          checked={true}
                          className={styles.checkbox}
                          onChange={() => handleUnstageFile(file.path)}
                        />
                        <span className={styles.fileName}>{file.filename}</span>
                        <span className={styles.filePath}>{file.path}</span>
                        <span className={`${styles.statusBadge} ${styles[`status${file.status}`]}`}>
                          {file.status}
                        </span>
                      </div>
                    ))}

                    {/* Unstaged Changes */}
                    {scmState.unstagedChanges.map((file) => (
                      <div
                        key={`unstaged-${file.path}`}
                        className={`${styles.fileRow} ${selectedFile?.path === file.path ? styles.fileRowSelected : ""}`}
                        onClick={() => setSelectedFile(file)}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          className={styles.checkbox}
                          onChange={() => handleStageFile(file.path)}
                        />
                        <span className={styles.fileName}>{file.filename}</span>
                        <span className={styles.filePath}>{file.path}</span>
                        <span className={`${styles.statusBadge} ${styles[`status${file.status}`]}`}>
                          {file.status}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* GitHub Desktop Commit Box */}
              <div className={styles.commitBox}>
                <input
                  type="text"
                  placeholder="Summary (required)"
                  value={commitSummary}
                  onChange={(e) => setCommitSummary(e.target.value)}
                  className={styles.commitTitleInput}
                />
                <textarea
                  placeholder="Description"
                  value={commitDescription}
                  onChange={(e) => setCommitDescription(e.target.value)}
                  className={styles.commitDescTextarea}
                />

                {showCoAuthor && (
                  <input
                    type="text"
                    placeholder="Co-authored-by: Name <email>"
                    value={coAuthors}
                    onChange={(e) => setCoAuthors(e.target.value)}
                    className={styles.commitTitleInput}
                  />
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    className={styles.signOutBtn}
                    onClick={() => setShowCoAuthor(!showCoAuthor)}
                  >
                    {showCoAuthor ? "- Remove Co-author" : "+ Add Co-author"}
                  </button>
                </div>

                <button
                  className={styles.commitBtn}
                  onClick={handleCommit}
                  disabled={!commitSummary.trim()}
                >
                  <VscCheck /> Commit to {scmState.branch}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORY VIEW */}
          {activeTab === "history" && (
            <div className={styles.historyViewContainer}>
              <div className={styles.searchHeader}>
                <input
                  type="text"
                  placeholder="Search commits by summary or author..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <div className={styles.commitList}>
                {filteredHistory.map((item) => (
                  <div
                    key={item.hash}
                    className={`${styles.historyItemRow} ${selectedCommitHash === item.hash ? styles.historyItemSelected : ""}`}
                    onClick={() => setSelectedCommitHash(item.hash)}
                  >
                    <div className={styles.avatarCircle}>
                      {item.author.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.historyContent}>
                      <div className={styles.historyMessage}>{item.message}</div>
                      <div className={styles.historyMeta}>
                        <span>{item.author}</span>
                        <span>•</span>
                        <span>{item.relativeDate}</span>
                        <span className={styles.shaBadge}>{item.hash.substring(0, 7)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: GITHUB VIEWS */}
          {activeTab === "github" && (
            <div className={styles.changesViewContainer}>
              <div className={styles.tabHeader}>
                <button
                  className={`${styles.tabBtn} ${githubSubTab === "prs" ? styles.tabBtnActive : ""}`}
                  onClick={() => setGithubSubTab("prs")}
                >
                  <VscGitPullRequest /> Pull Requests
                </button>
                <button
                  className={`${styles.tabBtn} ${githubSubTab === "issues" ? styles.tabBtnActive : ""}`}
                  onClick={() => setGithubSubTab("issues")}
                >
                  <VscIssues /> Issues
                </button>
              </div>

              <div style={{ flex: 1, overflow: "hidden" }}>
                {githubSubTab === "prs" ? (
                  <PullRequestsPanel key={ghUser?.login || "anon"} repoPath={rootPath} currentBranch={scmState.branch} />
                ) : (
                  <IssuesPanel key={ghUser?.login || "anon"} repoPath={rootPath} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Workspace Main Inspector Pane ── */}
        <div className={styles.mainInspectorArea}>
          {selectedCommitHash && commitDetail ? (
            /* Selected Commit Inspector */
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div className={styles.inspectorHeader}>
                <div className={styles.inspectorTitle}>
                  <VscHistory /> Commit Details ({commitDetail.hash.substring(0, 7)})
                </div>
                <div className={styles.inspectorActions}>
                  <button
                    className={styles.topSecondaryBtn}
                    onClick={() => navigator.clipboard.writeText(commitDetail.hash)}
                  >
                    <VscCopy /> Copy SHA
                  </button>
                  <button className={styles.iconBtn} onClick={() => setSelectedCommitHash(null)}>
                    <VscClose />
                  </button>
                </div>
              </div>

              <div className={styles.inspectorBody}>
                <div className={styles.commitCard}>
                  <div className={styles.commitCardHeader}>
                    <div className={styles.commitAuthorName}>{commitDetail.author}</div>
                    <div style={{ fontSize: "11px", color: "var(--pm-fg-subtle)" }}>
                      {commitDetail.date}
                    </div>
                  </div>
                  <div className={styles.commitFullMessage}>{commitDetail.message}</div>
                </div>

                <div className={styles.changedFilesHeader}>
                  Files Changed in Commit ({commitDetail.files.length})
                </div>

                {commitDetail.files.map((file) => (
                  <div key={file.path} className={styles.changedFileCardRow}>
                    <span className={`${styles.statusBadge} ${styles[`status${file.status}`]}`}>
                      {file.status}
                    </span>
                    <span className={styles.fileName}>{file.filename}</span>
                    <span className={styles.filePath}>{file.path}</span>
                    <button
                      className={styles.topSecondaryBtn}
                      style={{ padding: "2px 6px" }}
                      onClick={() => onOpenFile?.(file.path)}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedFile ? (
            /* Selected File Interactive Diff Pane */
            (() => {
              const diffData = parseUnifiedDiff(diffText || "");
              return (
                <div className={styles.diffContainer}>
                  <div className={styles.diffHeaderBar}>
                    <div className={styles.diffTitleGroup}>
                      <span>{selectedFile.filename}</span>
                      <span className={styles.filePath}>({selectedFile.path})</span>
                      {diffData.lines.length > 0 && (
                        <>
                          <span className={styles.diffBadgeAdd}>+{diffData.addCount}</span>
                          <span className={styles.diffBadgeDel}>-{diffData.delCount}</span>
                        </>
                      )}
                    </div>
                    <div className={styles.inspectorActions}>
                      {selectedFile.staged ? (
                        <button
                          className={styles.topSecondaryBtn}
                          onClick={() => handleUnstageFile(selectedFile.path)}
                        >
                          Unstage
                        </button>
                      ) : (
                        <button
                          className={styles.topActionBtn}
                          onClick={() => handleStageFile(selectedFile.path)}
                        >
                          Stage
                        </button>
                      )}

                      <button
                        className={styles.topSecondaryBtn}
                        onClick={() => handleDiscardFile(selectedFile.path)}
                        title="Discard all changes in this file"
                      >
                        Discard Changes
                      </button>

                      <button
                        className={styles.topActionBtn}
                        onClick={() => onOpenFile?.(selectedFile.path)}
                        title="Open file in editor tab"
                      >
                        Open in Editor
                      </button>
                    </div>
                  </div>

                  {selectedFile.status === "C" ? (
                    /* Merge Conflict Resolution Screen */
                    <div className={styles.welcomeCard}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "440px", alignItems: "center" }}>
                        <div style={{ padding: "12px 16px", backgroundColor: "rgba(248,81,73,0.15)", border: "1px solid rgba(248,81,73,0.4)", borderRadius: "6px", color: "#ff7b72", fontSize: "13px" }}>
                          <strong>⚠️ Merge Conflict Detected</strong>
                          <div style={{ marginTop: "4px", color: "var(--pm-fg-default)", fontSize: "12px" }}>
                            Choose how to resolve conflicts for this file or edit inline in the editor.
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                          <button className={styles.topActionBtn} onClick={() => onOpenFile?.(selectedFile.path)}>
                            Resolve in Pomai Editor →
                          </button>
                          <button className={styles.topSecondaryBtn} onClick={() => handleCheckoutOurs(selectedFile.path)}>
                            Use Ours (Keep Current Local Version)
                          </button>
                          <button className={styles.topSecondaryBtn} onClick={() => handleCheckoutTheirs(selectedFile.path)}>
                            Use Theirs (Keep Incoming Remote Version)
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isLoadingDiff ? (
                    <div className={styles.welcomeCard}>
                      <VscLoading className={styles.spinning} style={{ fontSize: "24px" }} />
                      <div className={styles.welcomeDesc}>Loading file diff...</div>
                    </div>
                  ) : diffData.lines.length > 0 ? (
                    <div className={styles.diffBody}>
                      <table className={styles.diffTable}>
                        <tbody>
                          {diffData.lines.map((line, idx) => {
                            let rowClass = "";
                            let prefixChar = " ";
                            if (line.type === "header") {
                              rowClass = styles.diffRowHeader;
                              prefixChar = "@@";
                            } else if (line.type === "add") {
                              rowClass = styles.diffRowAdd;
                              prefixChar = "+";
                            } else if (line.type === "delete") {
                              rowClass = styles.diffRowDelete;
                              prefixChar = "-";
                            }

                            return (
                              <tr key={idx} className={rowClass}>
                                <td className={styles.diffGutter}>{line.oldLineNo ?? ""}</td>
                                <td className={styles.diffGutter}>{line.newLineNo ?? ""}</td>
                                <td className={styles.diffPrefix}>{prefixChar}</td>
                                <td className={styles.diffContent}>{line.content}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.welcomeCard}>
                      <div className={styles.welcomeDesc}>No line changes to display for this file.</div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            /* GitHub Desktop Workspace Welcome Screen */
            <div className={styles.welcomeCard}>
              <div className={styles.welcomeIcon}>
                <VscRepo />
              </div>
              <div className={styles.welcomeTitle}>{repoName}</div>
              <div className={styles.welcomeDesc}>
                GitHub Desktop workspace active on branch <strong>{scmState.branch}</strong>.
              </div>

              <div className={styles.shortcutGrid}>
                <button className={styles.shortcutBtn} onClick={handleFetch}>
                  <VscSync /> Fetch Origin
                </button>
                <button className={styles.shortcutBtn} onClick={() => setIsBranchModalOpen(true)}>
                  <VscGitBranch /> Switch Branch
                </button>
                <button className={styles.shortcutBtn} onClick={handleStashSave} disabled={totalChanges === 0}>
                  <VscArchive /> Stash Workspace
                </button>
                <button className={styles.shortcutBtn} onClick={() => repo?.refresh()}>
                  <VscRefresh /> Refresh Git State
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Branch Switcher & New Branch Modal ── */}
      {isBranchModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsBranchModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Switch / Create Branch</span>
              <button className={styles.iconBtn} onClick={() => setIsBranchModalOpen(false)}>
                <VscClose />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Create Branch */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="New branch name..."
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className={styles.commitTitleInput}
                />
                <button
                  className={styles.topActionBtn}
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim()}
                >
                  Create
                </button>
              </div>

              {/* Filter Branches */}
              <input
                type="text"
                placeholder="Filter branches..."
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className={styles.searchInput}
              />

              {/* Branch List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {branches
                  .filter((b) => b.toLowerCase().includes(branchFilter.toLowerCase()))
                  .map((b) => (
                    <div
                      key={b}
                      className={`${styles.branchItemRow} ${b === scmState.branch ? styles.branchItemActive : ""}`}
                      onClick={() => handleCheckoutBranch(b)}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <VscGitBranch /> {b}
                      </span>
                      {b === scmState.branch && <VscCheck style={{ color: "#3fb950" }} />}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GitHub Auth Modal ── */}
      <GitHubAuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        onAuthSuccess={(user) => checkAuthStatus(user)}
      />
        </div>
      </div>
    </div>
  );
};
