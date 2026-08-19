import { useState, useEffect } from "react";
import {
  VscIssues,
  VscAdd,
  VscLoading,
  VscLink,
  VscCheck,
  VscClose,
  VscTag,
} from "react-icons/vsc";
import {
  githubListIssues,
  githubCreateIssue,
  Issue,
  CreateIssueParams,
} from "../../ipc/github";
import styles from "./IssuesPanel.module.css";

interface IssuesPanelProps {
  repoPath: string;
}

export function IssuesPanel({ repoPath }: IssuesPanelProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");

  const [createForm, setCreateForm] = useState({
    title: "",
    body: "",
    labels: [] as string[],
  });

  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    loadIssues();
  }, [repoPath]);

  const loadIssues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await githubListIssues(repoPath);
      setIssues(data);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLabel = () => {
    if (labelInput.trim() && !createForm.labels.includes(labelInput.trim())) {
      setCreateForm({
        ...createForm,
        labels: [...createForm.labels, labelInput.trim()],
      });
      setLabelInput("");
    }
  };

  const handleRemoveLabel = (label: string) => {
    setCreateForm({
      ...createForm,
      labels: createForm.labels.filter((l) => l !== label),
    });
  };

  const handleCreateIssue = async () => {
    if (!createForm.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params: CreateIssueParams = {
        title: createForm.title,
        body: createForm.body,
        labels: createForm.labels,
      };

      await githubCreateIssue(repoPath, params);
      setShowCreateForm(false);
      setCreateForm({
        title: "",
        body: "",
        labels: [],
      });
      await loadIssues();
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredIssues = issues.filter((issue) => {
    if (filter === "all") return true;
    if (filter === "open") return issue.state === "open";
    if (filter === "closed") return issue.state === "closed";
    return true;
  });

  const getIssueStatusClass = (issue: Issue) => {
    return issue.state === "open" ? styles.open : styles.closed;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <VscIssues />
          <span>Issues</span>
          {issues.length > 0 && <span className={styles.count}>{issues.length}</span>}
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
            onClick={loadIssues}
            title="Refresh"
            disabled={isLoading}
          >
            {isLoading ? <VscLoading className={styles.spinner} /> : <VscCheck />}
          </button>
          <button
            className={styles.iconButton}
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="Create Issue"
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
              placeholder="Issue title"
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
            <div className={styles.labelInputContainer}>
              <input
                type="text"
                className={styles.labelInput}
                placeholder="Add label (press Enter)"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLabel();
                  }
                }}
              />
              <button
                className={styles.addLabelButton}
                onClick={handleAddLabel}
                disabled={!labelInput.trim()}
              >
                <VscAdd />
              </button>
            </div>
            {createForm.labels.length > 0 && (
              <div className={styles.labels}>
                {createForm.labels.map((label) => (
                  <span key={label} className={styles.label}>
                    <VscTag />
                    {label}
                    <button
                      className={styles.removeLabel}
                      onClick={() => handleRemoveLabel(label)}
                    >
                      <VscClose />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
              onClick={handleCreateIssue}
              disabled={isLoading || !createForm.title.trim()}
            >
              Create Issue
            </button>
          </div>
        </div>
      )}

      <div className={styles.issueList}>
        {filteredIssues.length === 0 ? (
          <div className={styles.empty}>
            {isLoading ? (
              <div className={styles.loading}>
                <VscLoading className={styles.spinner} />
                <span>Loading issues...</span>
              </div>
            ) : (
              <span>No issues found</span>
            )}
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div key={issue.number} className={styles.issueItem}>
              <div className={styles.issueContent}>
                <div className={styles.issueHeader}>
                  <span className={styles.issueTitle}>{issue.title}</span>
                  <span
                    className={`${styles.issueStatus} ${getIssueStatusClass(issue)}`}
                  >
                    {issue.state}
                  </span>
                </div>
                <div className={styles.issueMeta}>
                  <span>#{issue.number}</span>
                  <span>by {issue.user_login}</span>
                </div>
                {issue.labels.length > 0 && (
                  <div className={styles.issueLabels}>
                    {issue.labels.map((label) => (
                      <span key={label} className={styles.label}>
                        <VscTag />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.issueLink}
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
