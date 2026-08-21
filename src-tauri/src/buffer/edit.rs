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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditResult {
    /// The version number of the document AFTER this edit.
    pub new_version: u64,
    /// The range that was actually affected in the new document coordinate space.
    /// Useful for re-tokenizing only the dirty region.
    pub affected_range: EditRange,
    /// Number of lines added (positive) or removed (negative) by this edit.
    pub line_delta: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_equality_and_ordering() {
        let pos1 = Position { line: 0, column: 5 };
        let pos2 = Position { line: 0, column: 5 };
        let pos3 = Position { line: 1, column: 0 };

        assert_eq!(pos1, pos2);
        assert_ne!(pos1, pos3);
    }

    #[test]
    fn test_edit_range_point() {
        let range = EditRange::point(2, 8);
        assert_eq!(range.start, Position { line: 2, column: 8 });
        assert_eq!(range.end, Position { line: 2, column: 8 });
        assert!(range.is_empty());
    }

    #[test]
    fn test_edit_range_non_empty() {
        let range = EditRange {
            start: Position { line: 1, column: 0 },
            end: Position { line: 1, column: 5 },
        };
        assert!(!range.is_empty());
    }

    #[test]
    fn test_text_edit_helpers() {
        let insert_edit = TextEdit::insert(4, 2, "const x = 10;");
        assert!(insert_edit.range.is_empty());
        assert_eq!(insert_edit.range.start, Position { line: 4, column: 2 });
        assert_eq!(insert_edit.new_text, "const x = 10;");

        let del_range = EditRange {
            start: Position { line: 0, column: 0 },
            end: Position { line: 0, column: 5 },
        };
        let delete_edit = TextEdit::delete(del_range);
        assert_eq!(delete_edit.range, del_range);
        assert!(delete_edit.new_text.is_empty());
    }

    #[test]
    fn test_serde_json_roundtrip() {
        let edit = TextEdit::insert(1, 2, "hello world");
        let json = serde_json::to_string(&edit).expect("Serialization failed");
        let deserialized: TextEdit = serde_json::from_str(&json).expect("Deserialization failed");

        assert_eq!(edit.range, deserialized.range);
        assert_eq!(edit.new_text, deserialized.new_text);

        let result = EditResult {
            new_version: 42,
            affected_range: EditRange::point(1, 13),
            line_delta: 2,
        };
        let res_json = serde_json::to_string(&result).expect("Result serialization failed");
        let deserialized_res: EditResult = serde_json::from_str(&res_json).expect("Result deserialization failed");

        assert_eq!(result, deserialized_res);
    }
}
