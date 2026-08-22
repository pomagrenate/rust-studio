use keyring::{Entry, Error as KeyringError};
use parking_lot::RwLock;
use std::sync::OnceLock;
use thiserror::Error;

const SERVICE_NAME: &str = "pomai-studio";
const KEYRING_ENTRY_NAME: &str = "github-pat";

static MEMORY_TOKEN: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn get_memory_token_lock() -> &'static RwLock<Option<String>> {
    MEMORY_TOKEN.get_or_init(|| RwLock::new(None))
}

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] KeyringError),
    #[error("Token not found")]
    TokenNotFound,
    #[error("Invalid token format")]
    InvalidToken,
}

/// Store GitHub Personal Access Token securely in OS keyring and in-memory cache
#[tauri::command]
pub fn store_github_token(token: String) -> Result<(), String> {
    let clean_token = token.trim().to_string();

    // Store in memory cache immediately
    *get_memory_token_lock().write() = Some(clean_token.clone());

    // Best-effort OS keyring persistence
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME) {
        let _ = entry.set_password(&clean_token);
    }

    Ok(())
}

/// Retrieve stored GitHub Personal Access Token from in-memory cache or OS keyring
#[tauri::command]
pub fn get_github_token() -> Result<Option<String>, String> {
    // 1. Check in-memory cache first
    if let Some(token) = get_memory_token_lock().read().as_ref() {
        if !token.trim().is_empty() {
            return Ok(Some(token.clone()));
        }
    }

    // 2. Fall back to OS keyring
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME) {
        if let Ok(token) = entry.get_password() {
            if !token.trim().is_empty() {
                // Populate memory cache
                *get_memory_token_lock().write() = Some(token.clone());
                return Ok(Some(token));
            }
        }
    }

    Ok(None)
}

/// Clear stored GitHub Personal Access Token from in-memory cache and OS keyring
#[tauri::command]
pub fn clear_github_token() -> Result<(), String> {
    // Clear in-memory cache
    *get_memory_token_lock().write() = None;

    // Delete from OS keyring
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEYRING_ENTRY_NAME) {
        let _ = entry.delete_credential();
    }

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
