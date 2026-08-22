/// commands/buffer_commands.rs — Tauri commands for text buffer operations.

use std::path::PathBuf;
use tauri::State;

use crate::buffer::TextBuffer;
use crate::buffer::edit::TextEdit;
use crate::buffer::edit::EditResult;
use crate::buffer::edit::Position;
use crate::document::{DocumentRegistry, DocumentInfo};

/// Open a document that is already in the registry (e.g. just loaded via open_file).
/// Returns basic document info.
#[tauri::command]
pub fn open_document(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<DocumentInfo, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    let info = doc_arc.read().info();
    Ok(info)
}

/// Close a document and free its memory.
#[tauri::command]
pub fn close_document(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> bool {
    registry.close(&PathBuf::from(&path))
}

/// Apply a text edit to the document buffer.
///
/// This is the primary mutation entry point from the frontend.
/// The frontend sends an edit (range + new_text) on every keystroke.
///
/// VS Code equivalent: `TextModel.applyEdits([IIdentifiedSingleEditOperation])`
#[tauri::command]
pub fn apply_edit(
    path: String,
    edit: TextEdit,
    cursor_before: Option<Position>,
    registry: State<'_, DocumentRegistry>,
) -> Result<EditResult, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;

    let result = doc_arc.write().apply_edit(&edit, cursor_before);
    Ok(result)
}

#[derive(Debug, serde::Serialize)]
pub struct VersionedLineRange {
    pub version: u64,
    pub start_line: usize,
    pub lines: Vec<String>,
}

/// Get the content of a range of lines (0-indexed, inclusive).
///
/// Called by the viewport renderer to fetch visible line content.
/// Returns an array of strings, one per line, without trailing newlines.
#[tauri::command]
pub fn get_line_range(
    path: String,
    start_line: usize,
    end_line: usize,
    registry: State<'_, DocumentRegistry>,
) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;

    let doc = doc_arc.read();
    Ok(doc.buffer.lines_content(start_line, end_line + 1))
}

/// Get the content of a range of lines along with the document's current version counter.
///
/// Discards stale asynchronous range fetches on the UI side if document version has advanced.
#[tauri::command]
pub fn get_line_range_versioned(
    path: String,
    start_line: usize,
    end_line: usize,
    registry: State<'_, DocumentRegistry>,
) -> Result<VersionedLineRange, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;

    let doc = doc_arc.read();
    let lines = doc.buffer.lines_content(start_line, end_line + 1);
    Ok(VersionedLineRange {
        version: doc.version,
        start_line,
        lines,
    })
}

/// Get metadata about a document (line count, version, dirty status, etc.).
#[tauri::command]
pub fn get_document_info(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<DocumentInfo, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    let info = doc_arc.read().info();
    Ok(info)
}

/// Get the total line count of a document.
#[tauri::command]
pub fn get_line_count(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<usize, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    let doc = doc_arc.read();
    Ok(doc.buffer.len_lines())
}

/// Undo the last edit in the document.
#[tauri::command]
pub fn undo_edit(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<(TextEdit, Position), String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    
    let mut doc = doc_arc.write();
    doc.undo().ok_or_else(|| "Nothing to undo".to_string())
}

/// Redo the last undone edit in the document.
#[tauri::command]
pub fn redo_edit(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<(TextEdit, EditResult), String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    
    let mut doc = doc_arc.write();
    doc.redo().ok_or_else(|| "Nothing to redo".to_string())
}

/// Check if undo is available for a document.
#[tauri::command]
pub fn can_undo(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<bool, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    let doc = doc_arc.read();
    Ok(doc.can_undo())
}

/// Check if redo is available for a document.
#[tauri::command]
pub fn can_redo(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<bool, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    let doc = doc_arc.read();
    Ok(doc.can_redo())
}

/// Format a Rust file using rustfmt.
#[tauri::command]
pub fn format_rust_file(
    path: String,
    registry: State<'_, DocumentRegistry>,
) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&path);
    let doc_arc = registry.get(&path)
        .ok_or_else(|| format!("Document not open: {}", path.display()))?;
    
    let doc = doc_arc.read();
    let content: std::borrow::Cow<str> = doc.buffer.slice(0, doc.buffer.len_chars());
    
    use crate::utils::CommandExtHideWindow;
    // Use rustfmt to format the content
    let mut output = std::process::Command::new("rustfmt")
        .hide_window()
        .arg("--emit")
        .arg("stdout")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn rustfmt: {}", e))?;
    
    {
        let stdin = output.stdin.as_mut().ok_or_else(|| "Failed to open stdin".to_string())?;
        use std::io::Write;
        stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to rustfmt: {}", e))?;
    }
    
    let output = output.wait_with_output().map_err(|e| format!("Failed to wait for rustfmt: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rustfmt failed: {}", stderr));
    }
    
    let formatted = String::from_utf8_lossy(&output.stdout);
    Ok(formatted.lines().map(|s| s.to_string()).collect())
}

/// Tokenize an array of strings (lines) and return an array of token arrays.
/// This acts as a pure function mock for Phase 1.
#[tauri::command]
pub fn tokenize_lines(lines: Vec<String>) -> Vec<Vec<u32>> {
    lines.iter().map(|line| crate::syntax::tokenize_line(line)).collect()
}
