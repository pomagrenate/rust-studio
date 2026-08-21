use keyring::{Entry, Error as KeyringError};
use thiserror::Error;

const SERVICE_NAME: &str = "pomai-studio";
const KEYRING_ENTRY_NAME: &str = "github-pat";

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] KeyringError),
    #[error("Token not found")]
    TokenNotFound,
    #[error("Invalid token format")]
    InvalidToken,
}

/// Store GitHub Personal Access Token securely in OS keyring
#[tauri::command]
pub fn store_github_token(token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME)
        .map_err(|e| e.to_string())?;
    entry.set_password(&token)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Retrieve stored GitHub Personal Access Token from OS keyring
#[tauri::command]
pub fn get_github_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME)
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => {
            if token.trim().is_empty() {
                Ok(None)
            } else {
                Ok(Some(token))
            }
        }
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Clear stored GitHub Personal Access Token from OS keyring
#[tauri::command]
pub fn clear_github_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME)
        .map_err(|e| e.to_string())?;
    entry.delete_credential()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Validate token format (basic check for GitHub PAT)
#[tauri::command]
pub fn validate_token_format(token: &str) -> Result<(), String> {
    let token = token.trim();
    
    // GitHub Classic PAT: starts with ghp_
    // GitHub Fine-grained PAT: starts with github_pat_
    if token.starts_with("ghp_") || token.starts_with("github_pat_") {
        if token.len() >= 20 {
            Ok(())
        } else {
            Err("Invalid token format: token too short".to_string())
        }
    } else {
        Err("Invalid token format: must start with ghp_ or github_pat_".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_classic_pat() {
        assert!(validate_token_format("ghp_1234567890abcdef1234567890abcdef123456").is_ok());
        assert!(validate_token_format("ghp_short").is_err());
    }

    #[test]
    fn test_validate_fine_grained_pat() {
        assert!(validate_token_format("github_pat_1234567890abcdef1234567890abcdef123456").is_ok());
        assert!(validate_token_format("github_pat_short").is_err());
    }

    #[test]
    fn test_validate_invalid_pat() {
        assert!(validate_token_format("invalid_token").is_err());
        assert!(validate_token_format("").is_err());
    }
}
