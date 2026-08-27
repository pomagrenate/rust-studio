use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use serde::{Deserialize, Serialize};
use crate::github::error::GitCommandResult;
use crate::utils::CommandExtHideWindow;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitFileChange {
    pub path: String,
    pub filename: String,
    pub status: String, // "M" | "A" | "D" | "R" | "U" | "??"
    pub staged: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitStatusResult {
    pub is_repo: bool,
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged_changes: Vec<GitFileChange>,
    pub unstaged_changes: Vec<GitFileChange>,
    pub untracked_files: Vec<GitFileChange>,
    pub has_conflicts: bool,
    pub conflicted_files: Vec<GitFileChange>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitCommitNode {
    pub hash: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub message: String,
    pub author: String,
    pub relative_date: String,
    pub is_head: bool,
    pub remote_ref: Option<String>,
    pub local_ref: Option<String>,
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatusResult, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        if !path.exists() {
            return Ok(GitStatusResult {
                is_repo: false,
                branch: String::new(),
                ahead: 0,
                behind: 0,
                staged_changes: Vec::new(),
                unstaged_changes: Vec::new(),
                untracked_files: Vec::new(),
                has_conflicts: false,
                conflicted_files: Vec::new(),
            });
        }

        // Run git status --porcelain=v1 -b -u
        let output = Command::new("git").hide_window()
            .args(&["status", "--porcelain=v1", "-b", "-u"])
            .current_dir(path)
            .output();

        let out = match output {
            Ok(o) if o.status.success() => o,
            _ => {
                return Ok(GitStatusResult {
                    is_repo: false,
                    branch: String::new(),
                    ahead: 0,
                    behind: 0,
                    staged_changes: Vec::new(),
                    unstaged_changes: Vec::new(),
                    untracked_files: Vec::new(),
                    has_conflicts: false,
                    conflicted_files: Vec::new(),
                });
            }
        };

        let stdout = String::from_utf8_lossy(&out.stdout);
        let mut branch = String::from("main");
        let mut ahead = 0;
        let mut behind = 0;
        let mut staged_changes = Vec::new();
        let mut unstaged_changes = Vec::new();
        let mut untracked_files = Vec::new();
        let mut conflicted_files = Vec::new();

        for line in stdout.lines() {
            if line.starts_with("##") {
                // Header line: ## branch...origin/branch [ahead 1, behind 2]
                let header = &line[3..];
                if let Some(first_part) = header.split("...").next() {
                    branch = first_part.trim().to_string();
                } else {
                    branch = header.trim().to_string();
                }
                if let Some(pos) = branch.find(' ') {
                    branch = branch[..pos].to_string();
                }

                if line.contains("ahead") {
                    if let Some(a_idx) = line.find("ahead ") {
                        let sub = &line[a_idx + 6..];
                        if let Some(num_str) = sub.split(|c: char| !c.is_numeric()).next() {
                            ahead = num_str.parse().unwrap_or(0);
                        }
                    }
                }
                if line.contains("behind") {
                    if let Some(b_idx) = line.find("behind ") {
                        let sub = &line[b_idx + 7..];
                        if let Some(num_str) = sub.split(|c: char| !c.is_numeric()).next() {
                            behind = num_str.parse().unwrap_or(0);
                        }
                    }
                }
                continue;
            }

            if line.len() < 4 {
                continue;
            }

            let index_status = line.chars().nth(0).unwrap_or(' ');
            let worktree_status = line.chars().nth(1).unwrap_or(' ');
            let file_rel_path = line[3..].trim().to_string();
            let filename = Path::new(&file_rel_path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| file_rel_path.clone());

            // Conflict check (UU, AA, DD, AU, UA, DU, UD)
            let is_conflict = index_status == 'U' || worktree_status == 'U' ||
                (index_status == 'A' && worktree_status == 'A') ||
                (index_status == 'D' && worktree_status == 'D');

            if is_conflict {
                conflicted_files.push(GitFileChange {
                    path: file_rel_path.clone(),
                    filename: filename.clone(),
                    status: "C".to_string(),
                    staged: false,
                });
                continue;
            }

            // Untracked
            if index_status == '?' && worktree_status == '?' {
                untracked_files.push(GitFileChange {
                    path: file_rel_path.clone(),
                    filename: filename.clone(),
                    status: "U".to_string(),
                    staged: false,
                });
                continue;
            }

            // Staged change
            if index_status != ' ' && index_status != '?' {
                staged_changes.push(GitFileChange {
                    path: file_rel_path.clone(),
                    filename: filename.clone(),
                    status: index_status.to_string(),
                    staged: true,
                });
            }

            // Unstaged change
            if worktree_status != ' ' && worktree_status != '?' {
                unstaged_changes.push(GitFileChange {
                    path: file_rel_path.clone(),
                    filename: filename.clone(),
                    status: worktree_status.to_string(),
                    staged: false,
                });
            }
        }

        let has_conflicts = !conflicted_files.is_empty();

        Ok(GitStatusResult {
            is_repo: true,
            branch,
            ahead,
            behind,
            staged_changes,
            unstaged_changes,
            untracked_files,
            has_conflicts,
            conflicted_files,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_checkout_ours(repo_path: String, file_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        let out = Command::new("git").hide_window()
            .args(&["checkout", "--ours", &file_path])
            .current_dir(path)
            .output();

        let _ = Command::new("git").hide_window()
            .args(&["add", &file_path])
            .current_dir(path)
            .output();

        match out {
            Ok(o) => Ok(GitCommandResult::from_command_output(o)),
            Err(e) => Err(e.to_string()),
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_checkout_theirs(repo_path: String, file_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        let out = Command::new("git").hide_window()
            .args(&["checkout", "--theirs", &file_path])
            .current_dir(path)
            .output();

        let _ = Command::new("git").hide_window()
            .args(&["add", &file_path])
            .current_dir(path)
            .output();

        match out {
            Ok(o) => Ok(GitCommandResult::from_command_output(o)),
            Err(e) => Err(e.to_string()),
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_abort_merge(repo_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        let out = Command::new("git").hide_window()
            .args(&["merge", "--abort"])
            .current_dir(path)
            .output();

        match out {
            Ok(o) => Ok(GitCommandResult::from_command_output(o)),
            Err(e) => Err(e.to_string()),
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_get_graph(repo_path: String, limit: Option<usize>) -> Result<Vec<GitCommitNode>, String> {
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let max_count = limit.unwrap_or(50).to_string();
        let output = Command::new("git").hide_window()
            .args(&[
                "log",
                "--all",
                "--decorate=short",
                &format!("-n{}", max_count),
                "--format=%h%x1f%p%x1f%d%x1f%s%x1f%an%x1f%cr"
            ])
            .current_dir(path)
            .output();

        let out = match output {
            Ok(o) if o.status.success() => o,
            _ => return Ok(Vec::new()),
        };

        let stdout = String::from_utf8_lossy(&out.stdout);
        let mut nodes = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\x1f').collect();
            if parts.len() < 6 {
                continue;
            }

            let hash = parts[0].trim().to_string();
            let parents_str = parts[1].trim();
            let parents: Vec<String> = if parents_str.is_empty() {
                Vec::new()
            } else {
                parents_str.split_whitespace().map(|s| s.to_string()).collect()
            };

            let raw_decorations = parts[2].trim();
            let mut refs = Vec::new();
            let mut is_head = false;
            let mut remote_ref = None;
            let mut local_ref = None;

            if !raw_decorations.is_empty() {
                let trimmed = raw_decorations.trim_start_matches('(').trim_end_matches(')');
                for item in trimmed.split(',') {
                    let d = item.trim();
                    if d.starts_with("HEAD ->") {
                        is_head = true;
                        let b = d["HEAD ->".len()..].trim().to_string();
                        local_ref = Some(b.clone());
                        refs.push(format!("HEAD -> {}", b));
                    } else if d == "HEAD" {
                        is_head = true;
                        refs.push("HEAD".to_string());
                    } else if d.starts_with("origin/") || d.contains('/') {
                        if remote_ref.is_none() {
                            remote_ref = Some(d.to_string());
                        }
                        refs.push(d.to_string());
                    } else if !d.is_empty() {
                        if local_ref.is_none() {
                            local_ref = Some(d.to_string());
                        }
                        refs.push(d.to_string());
                    }
                }
            }

            let message = parts[3].trim().to_string();
            let author = parts[4].trim().to_string();
            let relative_date = parts[5].trim().to_string();

            nodes.push(GitCommitNode {
                hash,
                parents,
                refs,
                message,
                author,
                relative_date,
                is_head,
                remote_ref,
                local_ref,
            });
        }

        Ok(nodes)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["add", "--", &file_path])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["restore", "--staged", "--", &file_path])
            .current_dir(&repo_path)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                return Ok(());
            }
        }

        let fallback = Command::new("git").hide_window()
            .args(&["reset", "HEAD", "--", &file_path])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !fallback.status.success() {
            return Err(String::from_utf8_lossy(&fallback.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["add", "-A"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_unstage_all(repo_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["restore", "--staged", "."])
            .current_dir(&repo_path)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                return Ok(());
            }
        }

        let fallback = Command::new("git").hide_window()
            .args(&["reset"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !fallback.status.success() {
            return Err(String::from_utf8_lossy(&fallback.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_discard_file(repo_path: String, file_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        // 1. Unstage the file from git index if it's staged
        let _ = Command::new("git").hide_window()
            .args(&["restore", "--staged", "--", &file_path])
            .current_dir(&repo_path)
            .output();

        let _ = Command::new("git").hide_window()
            .args(&["reset", "HEAD", "--", &file_path])
            .current_dir(&repo_path)
            .output();

        // 2. Checkout file from HEAD to discard tracked working directory changes
        let _ = Command::new("git").hide_window()
            .args(&["checkout", "HEAD", "--", &file_path])
            .current_dir(&repo_path)
            .output();

        // 3. Remove untracked files/directories if newly created
        let _ = Command::new("git").hide_window()
            .args(&["clean", "-fd", "--", &file_path])
            .current_dir(&repo_path)
            .output();

        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_discard_all(repo_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let _ = Command::new("git").hide_window()
            .args(&["restore", "--staged", "--worktree", "."])
            .current_dir(&repo_path)
            .output();

        let _ = Command::new("git").hide_window()
            .args(&["reset", "--hard", "HEAD"])
            .current_dir(&repo_path)
            .output();

        let _ = Command::new("git").hide_window()
            .args(&["clean", "-fd"])
            .current_dir(&repo_path)
            .output();

        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["commit", "-m", &message])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["push"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        Ok(GitCommandResult::from_command_output(output))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["pull"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        Ok(GitCommandResult::from_command_output(output))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_fetch(repo_path: String) -> Result<GitCommandResult, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["fetch"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        Ok(GitCommandResult::from_command_output(output))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_init(repo_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["init"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_get_branches(repo_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["branch", "--list"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let branches = stdout.lines()
            .map(|l| l.trim_start_matches('*').trim().to_string())
            .filter(|b| !b.is_empty())
            .collect();
        Ok(branches)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["checkout", &branch])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_get_conflicts(repo_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["diff", "--name-only", "--diff-filter=U"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let files: Vec<String> = stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        Ok(files)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git").hide_window()
            .args(&["branch", &branch_name])
            .current_dir(repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_resolve_conflict_file(
    repo_path: String,
    file_path: String,
    resolved_content: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let full_path = if Path::new(&file_path).is_absolute() {
            PathBuf::from(&file_path)
        } else {
            Path::new(&repo_path).join(&file_path)
        };

        // Write resolved content
        fs::write(&full_path, resolved_content)
            .map_err(|e| format!("Failed to write resolved file: {e}"))?;

        // Stage file with git add
        let output = Command::new("git").hide_window()
            .args(&["add", &full_path.to_string_lossy()])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("Failed to stage resolved file: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitStashItem {
    pub index: usize,
    pub name: String,
    pub branch: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitCommitDetail {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
    pub files: Vec<GitFileChange>,
}

#[tauri::command]
pub async fn git_stash_save(repo_path: String, message: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("git");
        cmd.hide_window().current_dir(&repo_path).arg("stash").arg("push").arg("-u");
        if let Some(msg) = message {
            if !msg.trim().is_empty() {
                cmd.arg("-m").arg(msg);
            }
        }
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stash_pop(repo_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .hide_window()
            .args(&["stash", "pop"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_stash_list(repo_path: String) -> Result<Vec<GitStashItem>, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .hide_window()
            .args(&["stash", "list"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut stashes = Vec::new();
        for (i, line) in stdout.lines().enumerate() {
            // Format: stash@{0}: WIP on main: c12345 message
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            let branch = if parts.len() > 1 { parts[1].trim().to_string() } else { "WIP".to_string() };
            let msg = if parts.len() > 2 { parts[2].trim().to_string() } else { line.to_string() };
            stashes.push(GitStashItem {
                index: i,
                name: format!("stash@{{{}}}", i),
                branch,
                message: msg,
            });
        }
        Ok(stashes)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_get_commit_details(repo_path: String, hash: String) -> Result<GitCommitDetail, String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .hide_window()
            .args(&["show", "--name-status", "--format=%an%x1f%cr%x1f%s%n", &hash])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut lines = stdout.lines();
        let first_line = lines.next().unwrap_or_default();
        let parts: Vec<&str> = first_line.split('\x1f').collect();
        let author = parts.get(0).unwrap_or(&"").to_string();
        let date = parts.get(1).unwrap_or(&"").to_string();
        let message = parts.get(2).unwrap_or(&"").to_string();

        let mut files = Vec::new();
        for line in lines {
            let line = line.trim();
            if line.is_empty() { continue; }
            let item_parts: Vec<&str> = line.split_whitespace().collect();
            if item_parts.len() >= 2 {
                let status = item_parts[0].to_string();
                let file_path = item_parts[1].to_string();
                let filename = Path::new(&file_path)
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| file_path.clone());
                files.push(GitFileChange {
                    path: file_path,
                    filename,
                    status,
                    staged: false,
                });
            }
        }

        Ok(GitCommitDetail {
            hash,
            author,
            date,
            message,
            files,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_get_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut args = vec!["diff", "-U3"];
        if staged {
            args.push("--staged");
        }
        args.push("--");
        args.push(&file_path);

        let output = Command::new("git")
            .hide_window()
            .args(&args)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if !stdout.is_empty() {
            return Ok(stdout);
        }

        // If diff is empty (e.g. untracked/new file), read file content directly
        let full_path = Path::new(&repo_path).join(&file_path);
        if full_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                let mut diff = format!("--- /dev/null\n+++ b/{}\n@@ -0,0 +1,{} @@\n", file_path, content.lines().count());
                for line in content.lines() {
                    diff.push('+');
                    diff.push_str(line);
                    diff.push('\n');
                }
                return Ok(diff);
            }
        }

        Ok(stdout)
    })
    .await
    .map_err(|e| e.to_string())?
}
