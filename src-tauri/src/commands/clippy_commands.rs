/**
 * clippy_commands.rs — Clippy linter integration for auto-fix and diagnostics
 *
 * This module provides Tauri commands for:
 * - Running clippy diagnostics and parsing JSON output
 * - Applying machine-applicable clippy fixes across the workspace
 * - Streaming progress and handling file modifications
 */

use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::cargo::diagnostic_mapper::{DiagnosticSeverity, DiagnosticRange, CodeSuggestion};

// ── Clippy Diagnostic Types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClippyDiagnostic {
    pub file_path: String,
    pub range: DiagnosticRange,
    pub severity: DiagnosticSeverity,
    pub lint_name: String,
    pub message: String,
    pub suggestions: Vec<CodeSuggestion>,
    pub is_machine_applicable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClippyFixResult {
    pub success: bool,
    pub files_modified: Vec<String>,
    pub fixes_applied: usize,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClippyProgress {
    pub message: String,
    pub files_processed: usize,
    pub total_files: Option<usize>,
}

// ── Tauri Commands ─────────────────────────────────────────────────────────

/// Run clippy diagnostics and return structured lint information
#[tauri::command]
pub async fn run_clippy_diagnostics(
    workspace_path: String,
) -> Result<Vec<ClippyDiagnostic>, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&workspace_path);
        
        // Run cargo clippy with JSON output
        let mut cmd = Command::new("cargo");
        cmd.args([
            "clippy",
            "--message-format=json",
            "--all-targets",
            "--quiet",
        ]);
        cmd.current_dir(root);
        
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run clippy: {}", e))?;
        
        if !output.status.success() {
            // Clippy returns non-zero even when there are just warnings
            // We still want to parse the output
        }
        
        // Parse JSON output line by line
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut diagnostics = Vec::new();
        
        for line in stdout.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Ok(Some(diagnostic)) = parse_clippy_message(&json, root) {
                    diagnostics.push(diagnostic);
                }
            }
        }
        
        Ok(diagnostics)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Apply clippy fixes across the workspace
#[tauri::command]
pub async fn apply_clippy_fix(
    workspace_path: String,
    allow_dirty: bool,
    app: AppHandle,
) -> Result<ClippyFixResult, String> {
    let workspace_path_clone = workspace_path.clone();
    
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&workspace_path_clone);
        
        // Build cargo clippy --fix command
        let mut cmd = Command::new("cargo");
        cmd.args(["clippy", "--fix", "--message-format=json"]);
        
        if allow_dirty {
            cmd.arg("--allow-dirty");
        }
        cmd.arg("--allow-staged");
        cmd.current_dir(root);
        
        // Emit progress start
        let _ = app.emit("clippy-progress", ClippyProgress {
            message: "Running clippy --fix...".to_string(),
            files_processed: 0,
            total_files: None,
        });
        
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run clippy --fix: {}", e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        
        // Parse modified files from output
        let files_modified = parse_modified_files(&stdout, &stderr);
        let fixes_applied = count_fixes_applied(&stdout);
        
        // Emit completion
        let _ = app.emit("clippy-progress", ClippyProgress {
            message: format!("Applied {} fixes across {} files", fixes_applied, files_modified.len()),
            files_processed: files_modified.len(),
            total_files: Some(files_modified.len()),
        });
        
        Ok(ClippyFixResult {
            success: output.status.success(),
            files_modified,
            fixes_applied,
            stdout,
            stderr,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Apply a single clippy suggestion to a file
#[tauri::command]
pub async fn apply_single_clippy_fix(
    file_path: String,
    suggestion: CodeSuggestion,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use std::fs;
        use crate::cargo::fix_application::apply_compiler_suggestion;
        use crate::buffer::RopeBuffer;
        use crate::buffer::TextBuffer;
        
        let path = Path::new(&file_path);
        
        // Read current file content
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        // Create rope buffer
        let mut buffer = RopeBuffer::from_str(&content);
        
        // Apply the suggestion
        apply_compiler_suggestion(&mut buffer, &suggestion)
            .map_err(|e| format!("Failed to apply suggestion: {}", e))?;
        
        // Write back
        let modified_content = buffer.slice(0, buffer.len_chars()).to_string();
        fs::write(path, modified_content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        
        Ok("Clippy fix applied successfully".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Parsing Helpers ───────────────────────────────────────────────────────

/// Parse a clippy JSON message into a structured diagnostic
fn parse_clippy_message(
    json: &serde_json::Value,
    workspace_root: &Path,
) -> Result<Option<ClippyDiagnostic>, Box<dyn std::error::Error>> {
    // Check if this is a clippy diagnostic
    let code = json.get("code")
        .and_then(|c| c.get("code"))
        .and_then(|c| c.as_str());
    
    let is_clippy = code.map(|c| c.starts_with("clippy::")).unwrap_or(false);
    if !is_clippy {
        return Ok(None);
    }
    
    let lint_name = code.unwrap_or("unknown").to_string();
    
    // Extract message
    let message = json.get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    
    // Extract level
    let level = json.get("level")
        .and_then(|l| l.as_str())
        .unwrap_or("warning");
    
    let severity = match level {
        "error" => DiagnosticSeverity::Error,
        "warning" => DiagnosticSeverity::Warning,
        "note" => DiagnosticSeverity::Information,
        "help" => DiagnosticSeverity::Hint,
        _ => DiagnosticSeverity::Warning,
    };
    
    // Extract span
    let spans = json.get("spans").and_then(|s| s.as_array());
    let (file_path, range) = if let Some(spans) = spans {
        if let Some(span) = spans.first() {
            let file_name = span.get("file_name")
                .and_then(|f| f.as_str())
                .unwrap_or("");
            
            let file_path = if Path::new(file_name).is_absolute() {
                file_name.to_string()
            } else {
                workspace_root.join(file_name)
                    .to_string_lossy()
                    .to_string()
            };
            
            let line_start = span.get("line_start")
                .and_then(|l| l.as_u64())
                .unwrap_or(0) as u32;
            
            let column_start = span.get("column_start")
                .and_then(|c| c.as_u64())
                .unwrap_or(0) as u32;
            
            let line_end = span.get("line_end")
                .and_then(|l| l.as_u64())
                .unwrap_or(line_start as u64) as u32;
            
            let column_end = span.get("column_end")
                .and_then(|c| c.as_u64())
                .unwrap_or(column_start as u64) as u32;
            
            let range = DiagnosticRange {
                start_line: line_start.saturating_sub(1),
                start_character: column_start.saturating_sub(1),
                end_line: line_end.saturating_sub(1),
                end_character: column_end.saturating_sub(1),
            };
            
            (file_path, range)
        } else {
            return Ok(None);
        }
    } else {
        return Ok(None);
    };
    
    // Extract suggestions
    let mut suggestions = Vec::new();
    let mut is_machine_applicable = false;
    
    if let Some(children) = json.get("children").and_then(|c| c.as_array()) {
        for child in children {
            if let Some(suggestion) = child.get("suggestion") {
                if let Some(code_suggestion) = parse_code_suggestion(suggestion, workspace_root)? {
                    is_machine_applicable = code_suggestion.applicability == "MachineApplicable";
                    suggestions.push(code_suggestion);
                }
            }
        }
    }
    
    Ok(Some(ClippyDiagnostic {
        file_path,
        range,
        severity,
        lint_name,
        message,
        suggestions,
        is_machine_applicable,
    }))
}

/// Parse a code suggestion from clippy output
fn parse_code_suggestion(
    suggestion: &serde_json::Value,
    _workspace_root: &Path,
) -> Result<Option<CodeSuggestion>, Box<dyn std::error::Error>> {
    let applicability = suggestion.get("applicability")
        .and_then(|a| a.as_str())
        .unwrap_or("Unknown")
        .to_string();
    
    if let Some(spans) = suggestion.get("spans").and_then(|s| s.as_array()) {
        if let Some(span) = spans.first() {
            let line_start = span.get("line_start")
                .and_then(|l| l.as_u64())
                .unwrap_or(0) as u32;
            
            let column_start = span.get("column_start")
                .and_then(|c| c.as_u64())
                .unwrap_or(0) as u32;
            
            let line_end = span.get("line_end")
                .and_then(|l| l.as_u64())
                .unwrap_or(line_start as u64) as u32;
            
            let column_end = span.get("column_end")
                .and_then(|c| c.as_u64())
                .unwrap_or(column_start as u64) as u32;
            
            let range = DiagnosticRange {
                start_line: line_start.saturating_sub(1),
                start_character: column_start.saturating_sub(1),
                end_line: line_end.saturating_sub(1),
                end_character: column_end.saturating_sub(1),
            };
            
            let replacement = suggestion.get("replacement")
                .and_then(|r| r.as_str())
                .unwrap_or("")
                .to_string();
            
            return Ok(Some(CodeSuggestion {
                range,
                replacement,
                applicability,
            }));
        }
    }
    
    Ok(None)
}

/// Parse modified files from clippy --fix output
fn parse_modified_files(stdout: &str, stderr: &str) -> Vec<String> {
    let mut files = std::collections::HashSet::new();
    
    // Look for "Fixed" messages in output
    for line in stdout.lines().chain(stderr.lines()) {
        if line.contains("Fixed") || line.contains("Applying") {
            // Try to extract file path
            if let Some(path) = extract_file_path(line) {
                files.insert(path);
            }
        }
    }
    
    files.into_iter().collect()
}

/// Extract file path from a clippy output line
fn extract_file_path(line: &str) -> Option<String> {
    // Look for .rs file paths
    for part in line.split_whitespace() {
        if part.ends_with(".rs") {
            // Clean up the path
            let cleaned = part.trim_matches(|c: char| c == '"' || c == '\'' || c == '(' || c == ')');
            return Some(cleaned.to_string());
        }
    }
    None
}

/// Count the number of fixes applied from output
fn count_fixes_applied(stdout: &str) -> usize {
    stdout.lines()
        .filter(|line| line.contains("Fixed") || line.contains("Applying"))
        .count()
}
