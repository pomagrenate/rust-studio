use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RepoError {
    #[error("Git command failed: {0}")]
    GitError(String),
    #[error("Not a git repository")]
    NotAGitRepo,
    #[error("No GitHub remote found")]
    NoGitHubRemote,
    #[error("Invalid remote URL: {0}")]
    InvalidRemoteUrl(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitHubRepoInfo {
    pub owner: String,
    pub repo: String,
    pub is_github: bool,
    pub remote_url: String,
    pub current_branch: String,
}

/// Parse git remote URL to extract GitHub owner and repo
pub fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
    // Handle HTTPS URLs: https://github.com/owner/repo.git
    if remote_url.starts_with("https://github.com/") {
        let path = remote_url.strip_prefix("https://github.com/")?;
        let path = path.strip_suffix(".git").unwrap_or(path);
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    
    // Handle SSH URLs: git@github.com:owner/repo.git
    if remote_url.starts_with("git@github.com:") {
        let path = remote_url.strip_prefix("git@github.com:")?;
        let path = path.strip_suffix(".git").unwrap_or(path);
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    
    // Handle GitHub Enterprise URLs
    if remote_url.contains("github") {
        // Try to extract owner/repo from enterprise URLs
        let url_without_git = remote_url.strip_suffix(".git").unwrap_or(remote_url);
        let parts: Vec<&str> = url_without_git.split('/').collect();
        if parts.len() >= 2 {
            let owner = parts[parts.len() - 2].to_string();
            let repo = parts[parts.len() - 1].to_string();
            return Some((owner, repo));
        }
    }
    
    None
}

/// Get GitHub repository information from a local git repository
pub fn get_github_repo_info(repo_path: &str) -> Result<GitHubRepoInfo, RepoError> {
    let path = Path::new(repo_path);
    if !path.exists() {
        return Err(RepoError::NotAGitRepo);
    }
    
    // Get current branch
    let branch_output = Command::new("git")
        .args(&["branch", "--show-current"])
        .current_dir(path)
        .output()
        .map_err(|e| RepoError::GitError(e.to_string()))?;
    
    if !branch_output.status.success() {
        return Err(RepoError::NotAGitRepo);
    }
    
    let current_branch = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();
    
    // Get remote URL (try origin first)
    let remote_output = Command::new("git")
        .args(&["remote", "get-url", "origin"])
        .current_dir(path)
        .output();
    
    let remote_url = match remote_output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => {
            // Try to get any remote
            let remotes_output = Command::new("git")
                .args(&["remote", "-v"])
                .current_dir(path)
                .output()
                .map_err(|e| RepoError::GitError(e.to_string()))?;
            
            if !remotes_output.status.success() {
                return Err(RepoError::NoGitHubRemote);
            }
            
            let stdout = String::from_utf8_lossy(&remotes_output.stdout);
            let first_line = stdout.lines().next();
            
            match first_line {
                Some(line) => {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        parts[1].to_string()
                    } else {
                        return Err(RepoError::NoGitHubRemote);
                    }
                }
                None => return Err(RepoError::NoGitHubRemote),
            }
        }
    };
    
    // Parse GitHub owner/repo
    let (owner, repo) = parse_github_remote(&remote_url)
        .ok_or_else(|| RepoError::InvalidRemoteUrl(remote_url.clone()))?;
    
    Ok(GitHubRepoInfo {
        owner,
        repo,
        is_github: true,
        remote_url,
        current_branch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_https() {
        let url = "https://github.com/owner/repo.git";
        let result = parse_github_remote(url);
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_github_ssh() {
        let url = "git@github.com:owner/repo.git";
        let result = parse_github_remote(url);
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_github_without_git() {
        let url = "https://github.com/owner/repo";
        let result = parse_github_remote(url);
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_non_github() {
        let url = "https://gitlab.com/owner/repo.git";
        let result = parse_github_remote(url);
        assert!(result.is_none());
    }
}
