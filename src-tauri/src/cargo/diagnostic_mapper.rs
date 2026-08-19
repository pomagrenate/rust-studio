/**
 * diagnostic_mapper.rs — Cargo JSON message parsing and LSP/Monaco diagnostic conversion
 * 
 * Features:
 * - Parse Cargo compiler messages from JSON format
 * - Extract spans, suggestions, macro origins
 * - Convert to LSP/Monaco compatible diagnostics
 * - Handle multi-crate workspaces
 * - Markdown rendering support
 */

use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// LSP/Monaco compatible diagnostic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CargoDiagnostic {
    /// File path (absolute)
    pub file_path: String,
    /// Diagnostic range
    pub range: DiagnosticRange,
    /// Severity level
    pub severity: DiagnosticSeverity,
    /// Error code (e.g., E0308)
    pub code: Option<String>,
    /// Rendered message with markdown
    pub rendered_message: String,
    /// Primary message without markdown
    pub message: String,
    /// Related information (notes, suggestions)
    pub related: Vec<RelatedInformation>,
    /// Code suggestions for auto-fix
    pub suggestions: Vec<CodeSuggestion>,
}

/// Diagnostic range (LSP/Monaco compatible)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticRange {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

/// Diagnostic severity
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

/// Related diagnostic information (notes, help text)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedInformation {
    pub file_path: String,
    pub range: DiagnosticRange,
    pub message: String,
}

/// Code suggestion for auto-fix
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSuggestion {
    pub range: DiagnosticRange,
    pub replacement: String,
    pub applicability: String, // "MaybeIncorrect", "HasPlaceholders", "MachineApplicable"
}

/// Parse a Cargo compiler message into diagnostics
pub fn parse_compiler_message(
    message: &Value,
    workspace_root: &Path,
) -> Result<Vec<CargoDiagnostic>, Box<dyn std::error::Error>> {
    let mut diagnostics = Vec::new();

    // Extract message level
    let level = message.get("level")
        .and_then(|l| l.as_str())
        .unwrap_or("error");

    let severity = match level {
        "error" => DiagnosticSeverity::Error,
        "warning" => DiagnosticSeverity::Warning,
        "note" => DiagnosticSeverity::Information,
        "help" => DiagnosticSeverity::Hint,
        _ => DiagnosticSeverity::Error,
    };

    // Extract spans
    if let Some(spans) = message.get("spans").and_then(|s| s.as_array()) {
        for span in spans {
            if let Some(diagnostic) = parse_span(span, message, severity, workspace_root)? {
                diagnostics.push(diagnostic);
            }
        }
    }

    // Extract code
    let code = message.get("code")
        .and_then(|c| c.get("code"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string());

    // Extract rendered message
    let rendered_message = message.get("rendered")
        .and_then(|r| r.as_str())
        .unwrap_or("")
        .to_string();

    // Extract primary message
    let message_text = message.get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();

    // Extract children (notes, suggestions)
    let mut related = Vec::new();
    let mut suggestions = Vec::new();

    if let Some(children) = message.get("children").and_then(|c| c.as_array()) {
        for child in children {
            if let Some(child_level) = child.get("level").and_then(|l| l.as_str()) {
                match child_level {
                    "note" | "help" => {
                        if let Some(child_span) = child.get("spans").and_then(|s| s.as_array()).and_then(|s| s.first()) {
                            if let Some(info) = parse_related_information(child_span, child, workspace_root)? {
                                related.push(info);
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Extract code suggestions
            if let Some(suggestion) = child.get("suggestion") {
                if let Some(code_suggestion) = parse_code_suggestion(suggestion, workspace_root)? {
                    suggestions.push(code_suggestion);
                }
            }
        }
    }

    // Update diagnostics with additional info
    for diagnostic in &mut diagnostics {
        diagnostic.code = code.clone();
        diagnostic.rendered_message = rendered_message.clone();
        diagnostic.message = message_text.clone();
        diagnostic.related = related.clone();
        diagnostic.suggestions = suggestions.clone();
    }

    Ok(diagnostics)
}

/// Parse a single span into a diagnostic
fn parse_span(
    span: &Value,
    _message: &Value,
    severity: DiagnosticSeverity,
    workspace_root: &Path,
) -> Result<Option<CargoDiagnostic>, Box<dyn std::error::Error>> {
    // Get file path
    let file_name = span.get("file_name")
        .and_then(|f| f.as_str())
        .ok_or("Missing file_name in span")?;

    // Skip if this is from external crate (unless it's a macro expansion)
    let is_external = !file_name.starts_with(workspace_root.to_string_lossy().as_ref());
    let is_macro_expansion = span.get("is_primary").and_then(|p| p.as_bool()).unwrap_or(false);
    
    if is_external && !is_macro_expansion {
        return Ok(None);
    }

    // Convert to absolute path
    let file_path = if Path::new(file_name).is_absolute() {
        file_name.to_string()
    } else {
        workspace_root.join(file_name)
            .to_string_lossy()
            .to_string()
    };

    // Extract span range
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

    // Convert to 0-indexed for LSP/Monaco
    let range = DiagnosticRange {
        start_line: line_start.saturating_sub(1),
        start_character: column_start.saturating_sub(1),
        end_line: line_end.saturating_sub(1),
        end_character: column_end.saturating_sub(1),
    };

    Ok(Some(CargoDiagnostic {
        file_path,
        range,
        severity,
        code: None,
        rendered_message: String::new(),
        message: String::new(),
        related: Vec::new(),
        suggestions: Vec::new(),
    }))
}

/// Parse related information (notes, help)
fn parse_related_information(
    span: &Value,
    message: &Value,
    workspace_root: &Path,
) -> Result<Option<RelatedInformation>, Box<dyn std::error::Error>> {
    let file_name = span.get("file_name")
        .and_then(|f| f.as_str())
        .ok_or("Missing file_name in span")?;

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

    let message_text = message.get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();

    Ok(Some(RelatedInformation {
        file_path,
        range,
        message: message_text,
    }))
}

/// Parse code suggestion
fn parse_code_suggestion(
    suggestion: &Value,
    _workspace_root: &Path,
) -> Result<Option<CodeSuggestion>, Box<dyn std::error::Error>> {
    let applicability = suggestion.get("applicability")
        .and_then(|a| a.as_str())
        .unwrap_or("Unknown")
        .to_string();

    // Extract span
    if let Some(spans) = suggestion.get("spans").and_then(|s| s.as_array()) {
        if let Some(span) = spans.first() {
            let _file_name = span.get("file_name")
                .and_then(|f| f.as_str())
                .ok_or("Missing file_name in span")?;

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
