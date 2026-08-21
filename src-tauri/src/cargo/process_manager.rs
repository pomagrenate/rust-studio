/**
 * process_manager.rs — Cargo build process manager with streaming diagnostics
 * 
 * Features:
 * - Async subprocess spawning via tokio::process::Command
 * - Line-by-line stdout streaming with AsyncBufReadExt
 * - Graceful cancellation via CancellationToken
 * - Real-time diagnostic emission via Tauri events
 * - Multi-crate workspace support
 * - Build locking prevention
 */

use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Emitter};

/// Cargo command types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CargoCommand {
    Check,
    Clippy,
    Build,
    Test,
}

impl CargoCommand {
    pub fn as_str(&self) -> &'static str {
        match self {
            CargoCommand::Check => "check",
            CargoCommand::Clippy => "clippy",
            CargoCommand::Build => "build",
            CargoCommand::Test => "test",
        }
    }
    
    fn args(&self) -> Vec<&'static str> {
        match self {
            CargoCommand::Check => vec!["check", "--message-format=json"],
            CargoCommand::Clippy => vec!["clippy", "--message-format=json", "--", "-D", "warnings"],
            CargoCommand::Build => vec!["build", "--message-format=json"],
            CargoCommand::Test => vec!["test", "--message-format=json", "--no-run"],
        }
    }
}

/// Active build process state
#[derive(Clone)]
struct ActiveProcess {
    command: CargoCommand,
    workspace_root: PathBuf,
    cancel_token: CancellationToken,
}

/// Cargo process manager with cancellation support
pub struct CargoProcessManager {
    /// Currently active process (if any)
    active_process: Arc<Mutex<Option<ActiveProcess>>>,
    /// App handle for event emission
    app_handle: AppHandle,
}

impl CargoProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active_process: Arc::new(Mutex::new(None)),
            app_handle,
        }
    }

    /// Run a Cargo command with streaming diagnostics
    pub async fn run_cargo_command(
        &self,
        workspace_root: PathBuf,
        command: CargoCommand,
    ) -> Result<(), String> {
        // Cancel any existing process
        self.cancel_active_process().await;

        // Create cancellation token for this process
        let cancel_token = CancellationToken::new();
        let cancel_token_clone = cancel_token.clone();

        // Store active process state
        {
            let mut active = self.active_process.lock().await;
            *active = Some(ActiveProcess {
                command,
                workspace_root: workspace_root.clone(),
                cancel_token: cancel_token_clone,
            });
        }

        // Spawn the Cargo process
        let mut child = self.spawn_cargo_process(&workspace_root, command)
            .map_err(|e| format!("Failed to spawn cargo {}: {}", command.as_str(), e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        // Spawn streaming tasks
        let app_handle = self.app_handle.clone();
        let workspace_root_clone = workspace_root.clone();
        let cancel_token_stdout = cancel_token.clone();
        let cancel_token_stderr = cancel_token.clone();
        
        let stdout_task = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                if cancel_token_stdout.is_cancelled() {
                    break;
                }
                
                if let Err(e) = Self::process_cargo_line(
                    &line,
                    &workspace_root_clone,
                    &app_handle,
                ).await {
                    eprintln!("Failed to process cargo line: {}", e);
                }
            }
        });

        // Stream stderr for non-JSON output
        let stderr_task = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                if cancel_token_stderr.is_cancelled() {
                    break;
                }
                eprintln!("Cargo stderr: {}", line);
            }
        });

        // Wait for process completion or cancellation
        tokio::select! {
            _ = cancel_token.cancelled() => {
                // Process was cancelled, kill it
                let _ = child.kill().await;
                let _ = child.wait().await;
                
                // Clear active process
                let mut active = self.active_process.lock().await;
                *active = None;
                
                Ok(())
            }
            status = child.wait() => {
                // Process completed naturally
                let _ = stdout_task.await;
                let _ = stderr_task.await;
                
                // Clear active process
                let mut active = self.active_process.lock().await;
                *active = None;
                
                match status {
                    Ok(s) if s.success() => Ok(()),
                    Ok(s) => Err(format!("Cargo {} exited with code {}", command.as_str(), s.code().unwrap_or(1))),
                    Err(e) => Err(format!("Failed to wait for cargo {}: {}", command.as_str(), e)),
                }
            }
        }
    }

    /// Cancel the currently active process
    pub async fn cancel_active_process(&self) {
        let mut active = self.active_process.lock().await;
        if let Some(process) = active.take() {
            process.cancel_token.cancel();
        }
    }

    /// Spawn a Cargo process
    fn spawn_cargo_process(
        &self,
        workspace_root: &PathBuf,
        command: CargoCommand,
    ) -> Result<Child, String> {
        Command::new("cargo")
            .current_dir(workspace_root)
            .args(command.args())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn cargo: {}", e))
    }

    /// Process a single line of Cargo JSON output
    async fn process_cargo_line(
        line: &str,
        workspace_root: &PathBuf,
        app_handle: &AppHandle,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Skip empty lines
        if line.trim().is_empty() {
            return Ok(());
        }

        // Try to parse as JSON
        let message: serde_json::Value = serde_json::from_str(line)?;
        
        // Check if this is a compiler message
        if let Some(reason) = message.get("reason").and_then(|r| r.as_str()) {
            match reason {
                "compiler-message" => {
                    if let Some(compiler_message) = message.get("message") {
                        let diagnostic = crate::cargo::diagnostic_mapper::parse_compiler_message(
                            compiler_message,
                            workspace_root,
                        )?;
                        
                        // Emit diagnostic event
                        let _ = app_handle.emit("cargo://diagnostic", diagnostic);
                    }
                }
                "compiler-artifact" => {
                    // Build progress notification
                    if let Some(artifact) = message.get("artifact_id").and_then(|a| a.as_str()) {
                        let _ = app_handle.emit("cargo://progress", format!("Building {}", artifact));
                    }
                }
                "build-finished" => {
                    // Build completion notification
                    let success = message.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
                    let _ = app_handle.emit("cargo://finished", success);
                }
                _ => {}
            }
        }

        Ok(())
    }

    /// Get the currently active process info
    pub async fn get_active_process(&self) -> Option<(CargoCommand, PathBuf)> {
        let active = self.active_process.lock().await;
        active.as_ref().map(|p| (p.command, p.workspace_root.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cargo_command_args() {
        assert_eq!(CargoCommand::Check.as_str(), "check");
        assert_eq!(CargoCommand::Check.args(), vec!["check", "--message-format=json"]);

        assert_eq!(CargoCommand::Clippy.as_str(), "clippy");
        assert_eq!(CargoCommand::Clippy.args(), vec!["clippy", "--message-format=json", "--", "-D", "warnings"]);

        assert_eq!(CargoCommand::Build.as_str(), "build");
        assert_eq!(CargoCommand::Build.args(), vec!["build", "--message-format=json"]);

        assert_eq!(CargoCommand::Test.as_str(), "test");
        assert_eq!(CargoCommand::Test.args(), vec!["test", "--message-format=json", "--no-run"]);
    }
}
