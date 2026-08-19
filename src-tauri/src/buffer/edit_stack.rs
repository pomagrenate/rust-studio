/// buffer/edit_stack.rs — Undo/redo stack for text edits.
///
/// Mirrors VSCode's `editStack.ts` implementation.
/// Tracks edit operations with version numbers and provides undo/redo functionality.

use std::collections::VecDeque;
use super::edit::{TextEdit, EditResult, Position};

const MAX_STACK_SIZE: usize = 100;

/// A single entry in the undo/redo stack.
#[derive(Debug, Clone)]
struct StackEntry {
    /// The edit that was applied.
    edit: TextEdit,
    /// The result of applying the edit (version, affected range, line delta).
    result: EditResult,
    /// The cursor position before the edit (for restoring on undo).
    cursor_before: Option<Position>,
}

/// Undo/redo stack for a document.
pub struct EditStack {
    /// Stack of edits that can be undone (most recent first).
    undo_stack: VecDeque<StackEntry>,
    /// Stack of edits that can be redone (most recent first).
    redo_stack: VecDeque<StackEntry>,
    /// Current document version.
    current_version: u64,
}

impl EditStack {
    /// Create a new empty edit stack.
    pub fn new() -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(MAX_STACK_SIZE),
            redo_stack: VecDeque::with_capacity(MAX_STACK_SIZE),
            current_version: 0,
        }
    }

    /// Push a new edit onto the undo stack.
    ///
    /// Clears the redo stack since a new edit invalidates the redo history.
    pub fn push_edit(&mut self, edit: TextEdit, result: EditResult, cursor_before: Option<Position>) {
        // Update current version
        self.current_version = result.new_version;

        // Push to undo stack
        let entry = StackEntry {
            edit,
            result,
            cursor_before,
        };

        if self.undo_stack.len() >= MAX_STACK_SIZE {
            self.undo_stack.pop_back(); // Remove oldest entry
        }
        self.undo_stack.push_front(entry);

        // Clear redo stack
        self.redo_stack.clear();
    }

    /// Get the current document version.
    pub fn current_version(&self) -> u64 {
        self.current_version
    }

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Pop the most recent edit from the undo stack.
    ///
    /// Returns the edit that should be reversed to undo the operation.
    pub fn pop_undo(&mut self) -> Option<(TextEdit, Position)> {
        let entry = self.undo_stack.pop_front()?;
        
        // Create the inverse edit
        let inverse_edit = TextEdit {
            range: entry.result.affected_range,
            new_text: String::new(), // Will be filled with the original text
        };

        // Restore cursor position before moving entry
        let cursor_pos = entry.cursor_before.unwrap_or(entry.result.affected_range.start);

        // Push to redo stack
        if self.redo_stack.len() >= MAX_STACK_SIZE {
            self.redo_stack.pop_back();
        }
        self.redo_stack.push_front(entry);

        Some((inverse_edit, cursor_pos))
    }

    /// Pop the most recent edit from the redo stack.
    ///
    /// Returns the edit that should be re-applied.
    pub fn pop_redo(&mut self) -> Option<(TextEdit, EditResult)> {
        let entry = self.redo_stack.pop_front()?;

        // Push back to undo stack
        if self.undo_stack.len() >= MAX_STACK_SIZE {
            self.undo_stack.pop_back();
        }
        self.undo_stack.push_front(entry.clone());

        // Update current version
        self.current_version = entry.result.new_version;

        Some((entry.edit, entry.result))
    }

    /// Clear the entire stack (e.g., when closing a document).
    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
        self.current_version = 0;
    }
}

impl Default for EditStack {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::edit::EditRange;

    #[test]
    fn test_empty_stack() {
        let stack = EditStack::new();
        assert!(!stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.current_version(), 0);
    }

    #[test]
    fn test_push_edit() {
        let mut stack = EditStack::new();
        let edit = TextEdit::insert(0, 0, "hello");
        let result = EditResult {
            new_version: 1,
            affected_range: EditRange::point(0, 5),
            line_delta: 0,
        };

        stack.push_edit(edit.clone(), result.clone(), None);

        assert!(stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.current_version(), 1);
    }

    #[test]
    fn test_undo_redo() {
        let mut stack = EditStack::new();
        let edit = TextEdit::insert(0, 0, "hello");
        let result = EditResult {
            new_version: 1,
            affected_range: EditRange::point(0, 5),
            line_delta: 0,
        };

        stack.push_edit(edit, result, None);

        // Undo
        let (inverse_edit, cursor_pos) = stack.pop_undo().unwrap();
        assert_eq!(inverse_edit.range.start.line, 0);
        assert_eq!(inverse_edit.range.start.column, 0);
        assert!(!stack.can_undo());
        assert!(stack.can_redo());

        // Redo
        let (redo_edit, redo_result) = stack.pop_redo().unwrap();
        assert!(stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(redo_result.new_version, 1);
    }

    #[test]
    fn test_max_stack_size() {
        let mut stack = EditStack::new();
        
        // Push more than MAX_STACK_SIZE edits
        for i in 0..=MAX_STACK_SIZE {
            let edit = TextEdit::insert(0, 0, &format!("edit{}", i));
            let result = EditResult {
                new_version: i as u64,
                affected_range: EditRange::point(0, 0),
                line_delta: 0,
            };
            stack.push_edit(edit, result, None);
        }

        // Should only have MAX_STACK_SIZE entries
        assert_eq!(stack.undo_stack.len(), MAX_STACK_SIZE);
    }

    #[test]
    fn test_clear() {
        let mut stack = EditStack::new();
        let edit = TextEdit::insert(0, 0, "hello");
        let result = EditResult {
            new_version: 1,
            affected_range: EditRange::point(0, 5),
            line_delta: 0,
        };

        stack.push_edit(edit, result, None);
        stack.clear();

        assert!(!stack.can_undo());
        assert!(!stack.can_redo());
        assert_eq!(stack.current_version(), 0);
    }
}
