import { useState, useEffect } from "react";
import {
  VscGitPullRequest,
  VscGitMerge,
  VscAdd,
  VscLoading,
  VscLink,
  VscCheck,
  VscClose,
} from "react-icons/vsc";
import {
  githubListPRs,
  githubCreatePR,
  githubGetRepoInfo,
  PullRequest,
  CreatePRParams,
  GitHubRepoInfo,
} from "../../ipc/github";
import styles from "./PullRequestsPanel.module.css";

interface PullRequestsPanelProps {
  repoPath: string;
  currentBranch: string;
}

export function PullRequestsPanel({
  repoPath,
  currentBranch,
}: PullRequestsPanelProps) {
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  const [createForm, setCreateForm] = useState({
    title: "",
    body: "",
    head: currentBranch,
    base: "main",
    draft: false,
  });

  useEffect(() => {
    loadPRs();
    loadRepoInfo();
  }, [repoPath]);

  useEffect(() => {
    setCreateForm((prev) => ({ ...prev, head: currentBranch }));
  }, [currentBranch]);

  const loadPRs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await githubListPRs(repoPath);
      setPRs(data);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRepoInfo = async () => {
    try {
      const info = await githubGetRepoInfo(repoPath);
      setRepoInfo(info);
      setCreateForm((prev) => ({ ...prev, base: info.current_branch }));
    } catch (err) {
      // Not a GitHub repo, that's okay
    }
  };

  const handleCreatePR = async () => {
    if (!createForm.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params: CreatePRParams = {
        title: createForm.title,
        body: createForm.body,
        head: createForm.head,
        base: createForm.base,
        draft: createForm.draft,
      };

      await githubCreatePR(repoPath, params);
      setShowCreateForm(false);
      setCreateForm({
        title: "",
        body: "",
        head: currentBranch,
        base: repoInfo?.current_branch || "main",
        draft: false,
      });
      await loadPRs();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPRs = prs.filter((pr) => {
    if (filter === "all") return true;
    if (filter === "open") return pr.state === "open";
    if (filter === "closed") return pr.state === "closed" || pr.state === "merged";
    return true;
  });

  const getPRStatusIcon = (pr: PullRequest) => {
    if (pr.state === "merged") return <VscGitMerge className={styles.mergedIcon} />;
    if (pr.state === "closed") return <VscClose className={styles.closedIcon} />;
    return <VscGitPullRequest className={styles.openIcon} />;
  };

  const getPRStatusClass = (pr: PullRequest) => {
    if (pr.state === "merged") return styles.merged;
    if (pr.state === "closed") return styles.closed;
    return styles.open;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <VscGitPullRequest />
          <span>Pull Requests</span>
          {prs.length > 0 && <span className={styles.count}>{prs.length}</span>}
        </div>
        <div className={styles.headerActions}>
          <select
            className={styles.filterSelect}
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <button
            className={styles.iconButton}
            onClick={loadPRs}
            title="Refresh"
            disabled={isLoading}
          >
            {isLoading ? <VscLoading className={styles.spinner} /> : <VscCheck />}
          </button>
          <button
            className={styles.iconButton}
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="Create Pull Request"
          >
            <VscAdd />
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className={styles.dismissButton}>
            <VscClose />
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className={styles.createForm}>
          <div className={styles.formRow}>
            <input
              type="text"
              className={styles.titleInput}
              placeholder="PR title"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm({ ...createForm, title: e.target.value })
              }
            />
          </div>
          <div className={styles.formRow}>
            <textarea
              className={styles.bodyInput}
              placeholder="Description (optional)"
              value={createForm.body}
              onChange={(e) =>
                setCreateForm({ ...createForm, body: e.target.value })
              }
              rows={4}
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.branchInputs}>
              <div>
                <label>From</label>
                <input
                  type="text"
                  className={styles.branchInput}
                  value={createForm.head}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, head: e.target.value })
                  }
                />
              </div>
              <span>→</span>
              <div>
                <label>To</label>
                <input
                  type="text"
                  className={styles.branchInput}
                  value={createForm.base}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, base: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <div className={styles.formRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={createForm.draft}
                onChange={(e) =>
                  setCreateForm({ ...createForm, draft: e.target.checked })
                }
              />
              Create as draft
            </label>
          </div>
          <div className={styles.formActions}>
            <button
              className={styles.cancelButton}
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </button>
            <button
              className={styles.createButton}
              onClick={handleCreatePR}
              disabled={isLoading || !createForm.title.trim()}
            >
              Create PR
            </button>
          </div>
        </div>
      )}

      <div className={styles.prList}>
        {filteredPRs.length === 0 ? (
          <div className={styles.empty}>
            {isLoading ? (
              <div className={styles.loading}>
                <VscLoading className={styles.spinner} />
                <span>Loading pull requests...</span>
              </div>
            ) : (
              <span>No pull requests found</span>
            )}
          </div>
        ) : (
          filteredPRs.map((pr) => (
            <div key={pr.number} className={styles.prItem}>
              <div className={styles.prIcon}>{getPRStatusIcon(pr)}</div>
              <div className={styles.prContent}>
                <div className={styles.prHeader}>
                  <span className={styles.prTitle}>{pr.title}</span>
                  <span className={`${styles.prStatus} ${getPRStatusClass(pr)}`}>
                    {pr.state}
                  </span>
                  {pr.draft && (
                    <span className={styles.draftBadge}>Draft</span>
                  )}
                </div>
                <div className={styles.prMeta}>
                  <span>#{pr.number}</span>
                  <span>by {pr.user_login}</span>
                  <span>
                    {pr.head_ref} → {pr.base_ref}
                  </span>
                </div>
              </div>
              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.prLink}
                title="Open in GitHub"
              >
                <VscLink />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
