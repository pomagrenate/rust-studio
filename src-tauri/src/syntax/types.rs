/// types.rs — Serializable syntax token types shared between parser and Tauri commands.

use serde::{Deserialize, Serialize};

/// A half-open byte range [start, end) within a single line or document.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ByteRange {
    pub start: u32,
    pub end: u32,
}

/// A precise source position (0-indexed).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SourcePoint {
    pub row: u32,
    pub col: u32,
}

/// One highlighted token emitted by the highlighter.
/// `scope` maps to a TextMate-like scope string (e.g. "keyword.control.rust")
/// that the frontend uses to look up a CSS color.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightToken {
    /// Source line (0-indexed).
    pub line: u32,
    /// Byte column start within that line (0-indexed).
    pub col_start: u32,
    /// Byte column end (exclusive).
    pub col_end: u32,
    /// TextMate scope string.
    pub scope: String,
}

/// A batch of tokens for one document, keyed by an opaque document ID.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightResult {
    pub doc_id: String,
    /// All tokens in document order.
    pub tokens: Vec<HighlightToken>,
    /// True if the source had parse errors (tree-sitter still produces a partial AST).
    pub has_errors: bool,
}

/// A single incremental edit to apply to the parser state before re-parsing.
/// Mirrors tree-sitter's `InputEdit`.
#[derive(Debug, Clone, Deserialize)]
pub struct TextEdit {
    pub start_byte: usize,
    pub old_end_byte: usize,
    pub new_end_byte: usize,
    pub start_position: [usize; 2],   // [row, col]
    pub old_end_position: [usize; 2],
    pub new_end_position: [usize; 2],
}
