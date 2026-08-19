import { invoke } from "@tauri-apps/api/core";

// TypeScript interfaces matching Rust structs
export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error_message?: string;
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  is_github: boolean;
  remote_url: string;
  current_branch: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  state: string; // "open", "closed", "merged"
  head_ref: string;
  base_ref: string;
  user_login: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  draft: boolean;
}

export interface CreatePRParams {
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
}

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: string; // "open", "closed"
  user_login: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  labels: string[];
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels: string[];
}

// Authentication commands
export async function githubStoreToken(token: string): Promise<void> {
  return invoke("store_github_token", { token });
}

export async function githubGetToken(): Promise<string | null> {
  return invoke("get_github_token");
}

export async function githubClearToken(): Promise<void> {
  return invoke("clear_github_token");
}

export async function githubValidateTokenFormat(token: string): Promise<void> {
  return invoke("validate_token_format", { token });
}

// GitHub API commands
export async function githubListPRs(repoPath: string): Promise<PullRequest[]> {
  return invoke("github_list_prs", { repoPath });
}

export async function githubCreatePR(
  repoPath: string,
  params: CreatePRParams
): Promise<PullRequest> {
  return invoke("github_create_pr", { repoPath, params });
}

export async function githubListIssues(repoPath: string): Promise<Issue[]> {
  return invoke("github_list_issues", { repoPath });
}

export async function githubCreateIssue(
  repoPath: string,
  params: CreateIssueParams
): Promise<Issue> {
  return invoke("github_create_issue", { repoPath, params });
}

export async function githubGetRepoInfo(repoPath: string): Promise<GitHubRepoInfo> {
  return invoke("github_get_repo_info", { repoPath });
}
