use crate::github::auth::{get_github_token, AuthError};
use crate::github::repo::{get_github_repo_info, GitHubRepoInfo, RepoError};
use octocrab::Octocrab;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitHubApiError {
    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),
    #[error("Repository error: {0}")]
    Repo(#[from] RepoError),
    #[error("GitHub API error: {0}")]
    Api(#[from] octocrab::Error),
    #[error("No GitHub token found")]
    NoToken,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String, // "open", "closed", "merged"
    pub head_ref: String,
    pub base_ref: String,
    pub user_login: String,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub draft: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String, // "open", "closed"
    pub user_login: String,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub labels: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreatePRParams {
    pub title: String,
    pub body: String,
    pub head: String,
    pub base: String,
    pub draft: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CreateIssueParams {
    pub title: String,
    pub body: String,
    pub labels: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserRepoItem {
    pub name: String,
    pub full_name: String,
    pub clone_url: String,
    pub is_private: bool,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub html_url: String,
}

pub fn format_octocrab_error(e: octocrab::Error) -> String {
    let msg = e.to_string();
    if msg.contains("401") || msg.contains("Bad credentials") || msg.contains("Requires authentication") {
        "Authentication Failed (401): GitHub Personal Access Token is invalid or expired. Please re-authenticate.".to_string()
    } else if msg.contains("403") || msg.contains("Resource not accessible") || msg.contains("Must have admin rights") {
        format!("Access Denied (403): Token lacks required permission ({})", msg)
    } else if msg.contains("404") {
        "Repository Not Found (404): Verify repository URL and token access permissions.".to_string()
    } else {
        format!("GitHub API Error: {}", msg)
    }
}

/// Live verification of a GitHub PAT against https://api.github.com/user
#[tauri::command]
pub async fn github_verify_token(token: Option<String>) -> Result<GitHubUser, String> {
    let pat = match token {
        Some(t) if !t.trim().is_empty() => t.trim().to_string(),
        _ => get_github_token()
            .map_err(|e| format!("Keyring error: {}", e))?
            .ok_or_else(|| "No GitHub token found in OS keyring".to_string())?,
    };

    let client = Octocrab::builder()
        .personal_token(pat)
        .build()
        .map_err(|e| e.to_string())?;

    let user = client
        .current()
        .user()
        .await
        .map_err(format_octocrab_error)?;

    Ok(GitHubUser {
        login: user.login.clone(),
        name: Some(user.login),
        avatar_url: user.avatar_url.to_string(),
        html_url: user.html_url.to_string(),
    })
}

/// Initialize octocrab client with stored PAT
async fn get_github_client() -> Result<Octocrab, GitHubApiError> {
    let token = get_github_token()
        .map_err(|_| GitHubApiError::NoToken)?
        .ok_or(GitHubApiError::NoToken)?;
    
    let client = Octocrab::builder()
        .personal_token(token)
        .build()?;
    
    Ok(client)
}

/// List pull requests for the current repository
#[tauri::command]
pub async fn github_list_prs(repo_path: String) -> Result<Vec<PullRequest>, String> {
    let repo_info = get_github_repo_info(&repo_path)
        .map_err(|e| e.to_string())?;
    
    let client = get_github_client()
        .await
        .map_err(|e| e.to_string())?;
    
    let owner = repo_info.owner.clone();
    let repo = repo_info.repo.clone();
    
    let prs = client
        .pulls(&owner, &repo)
        .list()
        .state(octocrab::params::State::All)
        .send()
        .await
        .map_err(format_octocrab_error)?;
    
    let mut result = Vec::new();
    let mut page = Some(prs);
    
    while let Some(current_page) = page {
        for pr in current_page.items {
            result.push(PullRequest {
                number: pr.number,
                title: pr.title.unwrap_or_default(),
                body: pr.body,
                state: format!("{:?}", pr.state),
                head_ref: pr.head.ref_field,
                base_ref: pr.base.ref_field,
                user_login: pr.user.as_ref().map(|u| u.login.clone()).unwrap_or_default(),
                created_at: pr.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                updated_at: pr.updated_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
                html_url: pr.html_url.as_ref().map(|u| u.to_string()).unwrap_or_default(),
                draft: pr.draft.unwrap_or(false),
            });
        }
        
        page = client.get_page(&current_page.next).await.map_err(|e| e.to_string())?;
    }
    
    Ok(result)
}

/// Create a new pull request
#[tauri::command]
pub async fn github_create_pr(repo_path: String, params: CreatePRParams) -> Result<PullRequest, String> {
    let repo_info = get_github_repo_info(&repo_path)
        .map_err(|e| e.to_string())?;
    
    let client = get_github_client()
        .await
        .map_err(|e| e.to_string())?;
    
    let owner = repo_info.owner.clone();
    let repo = repo_info.repo.clone();
    
    let new_pr = client
        .pulls(&owner, &repo)
        .create(params.title, params.head, params.base)
        .body(params.body)
        .draft(params.draft)
        .send()
        .await
        .map_err(format_octocrab_error)?;
    
    Ok(PullRequest {
        number: new_pr.number,
        title: new_pr.title.unwrap_or_default(),
        body: new_pr.body,
        state: format!("{:?}", new_pr.state),
        head_ref: new_pr.head.ref_field,
        base_ref: new_pr.base.ref_field,
        user_login: new_pr.user.as_ref().map(|u| u.login.clone()).unwrap_or_default(),
        created_at: new_pr.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
        updated_at: new_pr.updated_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
        html_url: new_pr.html_url.as_ref().map(|u| u.to_string()).unwrap_or_default(),
        draft: new_pr.draft.unwrap_or(false),
    })
}

/// List issues for the current repository
#[tauri::command]
pub async fn github_list_issues(repo_path: String) -> Result<Vec<Issue>, String> {
    let repo_info = get_github_repo_info(&repo_path)
        .map_err(|e| e.to_string())?;
    
    let client = get_github_client()
        .await
        .map_err(|e| e.to_string())?;
    
    let owner = repo_info.owner.clone();
    let repo = repo_info.repo.clone();
    
    let issues = client
        .issues(&owner, &repo)
        .list()
        .state(octocrab::params::State::All)
        .send()
        .await
        .map_err(format_octocrab_error)?;
    
    let mut result = Vec::new();
    let mut page = Some(issues);
    
    while let Some(current_page) = page {
        for issue in current_page.items {
            let labels: Vec<String> = issue.labels
                .iter()
                .map(|l| l.name.clone())
                .collect();
            
            result.push(Issue {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: format!("{:?}", issue.state),
                user_login: issue.user.login,
                created_at: issue.created_at.to_rfc3339(),
                updated_at: issue.updated_at.to_rfc3339(),
                html_url: issue.html_url.to_string(),
                labels,
            });
        }
        
        page = client.get_page(&current_page.next).await.map_err(|e| e.to_string())?;
    }
    
    Ok(result)
}

/// Create a new issue
#[tauri::command]
pub async fn github_create_issue(repo_path: String, params: CreateIssueParams) -> Result<Issue, String> {
    let repo_info = get_github_repo_info(&repo_path)
        .map_err(|e| e.to_string())?;
    
    let client = get_github_client()
        .await
        .map_err(|e| e.to_string())?;
    
    let owner = repo_info.owner.clone();
    let repo = repo_info.repo.clone();
    
    let labels: Vec<String> = params.labels;
    
    let new_issue = client
        .issues(&owner, &repo)
        .create(params.title)
        .body(params.body)
        .labels(labels)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let issue_labels: Vec<String> = new_issue.labels
        .iter()
        .map(|l| l.name.clone())
        .collect();
    
    Ok(Issue {
        number: new_issue.number,
        title: new_issue.title,
        body: new_issue.body,
        state: format!("{:?}", new_issue.state),
        user_login: new_issue.user.login,
        created_at: new_issue.created_at.to_rfc3339(),
        updated_at: new_issue.updated_at.to_rfc3339(),
        html_url: new_issue.html_url.to_string(),
        labels: issue_labels,
    })
}

/// Get repository information from GitHub
#[tauri::command]
pub async fn github_get_repo_info(repo_path: String) -> Result<GitHubRepoInfo, String> {
    let mut repo_info = get_github_repo_info(&repo_path)
        .map_err(|e| e.to_string())?;
    
    // Optionally validate against GitHub API if token is configured
    if let Ok(client) = get_github_client().await {
        let owner = repo_info.owner.clone();
        let repo = repo_info.repo.clone();
        if client.repos(&owner, &repo).get().await.is_err() {
            repo_info.is_github = false;
        }
    }
    
    Ok(repo_info)
}

/// List GitHub repositories for the authenticated user
#[tauri::command]
pub async fn github_list_user_repos() -> Result<Vec<UserRepoItem>, String> {
    let client = get_github_client()
        .await
        .map_err(|e| e.to_string())?;
    
    let items: Vec<serde_json::Value> = client
        .get("/user/repos?sort=updated&per_page=50", None::<&()>)
        .await
        .map_err(|e| e.to_string())?;
    
    let mut repos = Vec::new();
    for item in items {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let full_name = item.get("full_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let clone_url = item.get("clone_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let is_private = item.get("private").and_then(|v| v.as_bool()).unwrap_or(false);
        let description = item.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
        
        repos.push(UserRepoItem {
            name,
            full_name,
            clone_url,
            is_private,
            description,
        });
    }
    
    Ok(repos)
}
