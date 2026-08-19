/// buffer/edit.rs — Describes a single atomic text edit operation.
///
/// Mirrors VS Code's `IIdentifiedSingleEditOperation` / `ISingleEditOperation`.

use serde::{Deserialize, Serialize};

/// A (line, column) position in the document. Both are 0-indexed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    /// 0-indexed line number.
    pub line: usize,
    /// 0-indexed character (Unicode scalar) offset within the line.
    pub column: usize,
}

/// A half-open range `[start, end)` of positions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditRange {
    pub start: Position,
    pub end: Position,
}

impl EditRange {
    /// Create a single-point (zero-width) range — useful for pure insertions.
    pub fn point(line: usize, column: usize) -> Self {
        let pos = Position { line, column };
        Self { start: pos, end: pos }
    }

    /// Is this an empty (zero-width) range? i.e. a pure insertion point.
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
}

/// A single atomic text edit: replace `range` with `new_text`.
///
/// - **Pure insertion:** `range.is_empty() && !new_text.is_empty()`
/// - **Pure deletion:**  `!range.is_empty() && new_text.is_empty()`
/// - **Replace:**        `!range.is_empty() && !new_text.is_empty()`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEdit {
    /// The range to replace. Use `EditRange::point` for insertions.
    pub range: EditRange,
    /// The text to insert in place of `range`. Empty string = pure deletion.
    pub new_text: String,
}

impl TextEdit {
    /// Convenience: create a pure insertion at (line, col).
    pub fn insert(line: usize, column: usize, text: impl Into<String>) -> Self {
        Self {
            range: EditRange::point(line, column),
            new_text: text.into(),
        }
    }

    /// Convenience: create a deletion of a range.
    pub fn delete(range: EditRange) -> Self {
        Self { range, new_text: String::new() }
    }
}

/// Result returned after applying an edit. Carries enough information for
/// the undo stack and to notify the frontend of what changed.
#[derive(Debug, Clone, Serialize)]
pub struct EditResult {
    /// The version number of the document AFTER this edit.
    pub new_version: u64,
    /// The range that was actually affected in the new document coordinate space.
    /// Useful for re-tokenizing only the dirty region.
    pub affected_range: EditRange,
    /// Number of lines added (positive) or removed (negative) by this edit.
    pub line_delta: i64,
}
