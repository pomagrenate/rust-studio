/**
 * extensions/builtin/git/GitSCMProvider.ts
 * Built-in Git Extension provider communicating with Rust git engine.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  ISCMProvider,
  ISCMRepository,
  ISCMRepositoryState,
  ISCMResource,
  ISCMHistoryItem,
} from "../../types";

interface RustGitFileChange {
  path: string;
  filename: string;
  status: string;
  staged: boolean;
}

interface RustGitStatusResult {
  is_repo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged_changes: RustGitFileChange[];
  unstaged_changes: RustGitFileChange[];
  untracked_files: RustGitFileChange[];
}

interface RustGitCommitNode {
  hash: string;
  parents: string[];
  refs: string[];
  message: string;
  author: string;
  relative_date: string;
  is_head: boolean;
  remote_ref?: string;
  local_ref?: string;
}

export class GitRepository implements ISCMRepository {
  public readonly id: string;
  public readonly providerId = "git";
  public readonly rootUri: string;

  private state: ISCMRepositoryState = {
    isRepo: false,
    branch: "main",
    ahead: 0,
    behind: 0,
    stagedChanges: [],
    unstagedChanges: [],
    history: [],
    isLoading: false,
  };

  private listeners = new Set<(state: ISCMRepositoryState) => void>();

  constructor(rootUri: string) {
    this.rootUri = rootUri;
    this.id = `git:${rootUri}`;
    this.refresh();
  }

  getState(): ISCMRepositoryState {
    return this.state;
  }

  subscribe(listener: (state: ISCMRepositoryState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  async refresh(): Promise<void> {
    if (!this.rootUri) return;
    this.state.isLoading = true;
    this.notify();

    try {
      if (window.__TAURI_INTERNALS__) {
        const [statusRes, graphRes] = await Promise.all([
          invoke<RustGitStatusResult>("git_status", { repoPath: this.rootUri }),
          invoke<RustGitCommitNode[]>("git_get_graph", { repoPath: this.rootUri, limit: 50 }),
        ]);

        const staged: ISCMResource[] = (statusRes.staged_changes || []).map((f) => ({
          path: f.path,
          filename: f.filename,
          status: f.status,
          staged: true,
        }));

        const unstaged: ISCMResource[] = [
          ...(statusRes.unstaged_changes || []).map((f) => ({
            path: f.path,
            filename: f.filename,
            status: f.status,
            staged: false,
          })),
          ...(statusRes.untracked_files || []).map((f) => ({
            path: f.path,
            filename: f.filename,
            status: f.status,
            staged: false,
          })),
        ];

        const history: ISCMHistoryItem[] = (graphRes || []).map((n) => ({
          hash: n.hash,
          parents: n.parents,
          refs: n.refs,
          message: n.message,
          author: n.author,
          relativeDate: n.relative_date,
          isHead: n.is_head,
          remoteRef: n.remote_ref,
          localRef: n.local_ref,
        }));

        this.state = {
          isRepo: statusRes.is_repo,
          branch: statusRes.branch || "main",
          ahead: statusRes.ahead || 0,
          behind: statusRes.behind || 0,
          stagedChanges: staged,
          unstagedChanges: unstaged,
          history,
          isLoading: false,
        };
      } else {
        // Fallback for non-Tauri web preview
        this.state = {
          isRepo: true,
          branch: "main",
          ahead: 0,
          behind: 20,
          stagedChanges: [],
          unstagedChanges: [
            { path: "src/App.tsx", filename: "App.tsx", status: "M", staged: false },
          ],
          history: [
            {
              hash: "a1b2c3d",
              parents: [],
              refs: ["HEAD -> main", "origin/main"],
              message: "feat(projects): add diagram, infer...",
              author: "Developer",
              relativeDate: "10 minutes ago",
              isHead: true,
              remoteRef: "origin/main",
            },
            ...Array.from({ length: 10 }).map((_, i) => ({
              hash: `c${i}`,
              parents: [],
              refs: [],
              message: "Update AI Agent",
              author: "Developer",
              relativeDate: `${i + 1} hours ago`,
              isHead: false,
            })),
          ],
          isLoading: false,
        };
      }
    } catch (err) {
      console.error("Git refresh error:", err);
      this.state.isLoading = false;
    }

    this.notify();
  }

  async stage(paths: string[]): Promise<void> {
    for (const filePath of paths) {
      await invoke("git_stage_file", { repoPath: this.rootUri, filePath });
    }
    await this.refresh();
  }

  async unstage(paths: string[]): Promise<void> {
    for (const filePath of paths) {
      await invoke("git_unstage_file", { repoPath: this.rootUri, filePath });
    }
    await this.refresh();
  }

  async stageAll(): Promise<void> {
    await invoke("git_stage_all", { repoPath: this.rootUri });
    await this.refresh();
  }

  async unstageAll(): Promise<void> {
    await invoke("git_unstage_all", { repoPath: this.rootUri });
    await this.refresh();
  }

  async discard(paths: string[]): Promise<void> {
    for (const filePath of paths) {
      await invoke("git_discard_file", { repoPath: this.rootUri, filePath });
    }
    await this.refresh();
  }

  async discardAll(): Promise<void> {
    await invoke("git_discard_all", { repoPath: this.rootUri });
    await this.refresh();
  }

  async commit(message: string): Promise<void> {
    if (this.state.stagedChanges.length === 0) {
      await this.stageAll();
    }
    await invoke("git_commit", { repoPath: this.rootUri, message });
    await this.refresh();
  }

  async sync(): Promise<void> {
    this.state.isLoading = true;
    this.notify();
    try {
      await invoke("git_pull", { repoPath: this.rootUri });
      await invoke("git_push", { repoPath: this.rootUri });
    } finally {
      await this.refresh();
    }
  }

  async initRepo(): Promise<void> {
    await invoke("git_init", { repoPath: this.rootUri });
    await this.refresh();
  }
}

export class GitSCMProvider implements ISCMProvider {
  public readonly id = "git";
  public readonly label = "Git";
  private repositories = new Map<string, GitRepository>();

  async createRepository(rootUri: string): Promise<ISCMRepository | null> {
    if (!rootUri) return null;
    let repo = this.repositories.get(rootUri);
    if (!repo) {
      repo = new GitRepository(rootUri);
      this.repositories.set(rootUri, repo);
    }
    return repo;
  }
}
