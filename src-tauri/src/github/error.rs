use serde::{Deserialize, Serialize};

/// Structured result for Git/GitHub commands with full output capture
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub error_message: Option<String>,
}

impl GitCommandResult {
    pub fn success(stdout: String) -> Self {
        Self {
            success: true,
            stdout,
            stderr: String::new(),
            error_message: None,
        }
    }

    pub fn error(stderr: String, error_message: Option<String>) -> Self {
        Self {
            success: false,
            stdout: String::new(),
            stderr,
            error_message,
        }
    }

    pub fn from_command_output(output: std::process::Output) -> Self {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        
        if output.status.success() {
            Self::success(stdout)
        } else {
            let error_message = Self::parse_error_message(&stderr);
            Self::error(stderr, error_message)
        }
    }

    fn parse_error_message(stderr: &str) -> Option<String> {
        // Parse common Git error patterns to provide actionable guidance
        let stderr_lower = stderr.to_lowercase();
        
        if stderr_lower.contains("permission denied") {
            Some("Authentication failed. Please check your SSH keys or GitHub PAT.".to_string())
        } else if stderr_lower.contains("could not read from remote") {
            Some("Network error. Please check your internet connection and repository URL.".to_string())
        } else if stderr_lower.contains("non-fast-forward") {
            Some("Push rejected. Please pull remote changes first or use force push if intentional.".to_string())
        } else if stderr_lower.contains("merge conflict") {
            Some("Merge conflict detected. Please resolve conflicts before continuing.".to_string())
        } else if stderr_lower.contains("401") || stderr_lower.contains("bad credentials") {
            Some("Invalid GitHub credentials. Please update your Personal Access Token.".to_string())
        } else if stderr_lower.contains("404") {
            Some("Repository not found. Please check the repository URL and your access permissions.".to_string())
        } else if stderr_lower.contains("403") {
            Some("Access denied. Please check your repository permissions and PAT scopes.".to_string())
        } else {
            None
        }
    }
}

impl std::fmt::Display for GitCommandResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.success {
            write!(f, "Success: {}", self.stdout)
        } else {
            write!(f, "Error: {} | Stderr: {}", 
                self.error_message.as_deref().unwrap_or("Unknown error"),
                self.stderr)
        }
    }
}
