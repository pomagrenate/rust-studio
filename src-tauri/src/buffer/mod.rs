/// buffer/mod.rs — Public interface for the text buffer subsystem.
///
/// Design mirrors VS Code's ITextBuffer interface but expressed as a Rust trait.
/// The backing implementation uses a Rope (ropey crate) which provides the same
/// O(log N) insert/delete guarantees as VS Code's Piece Tree, but with a
/// battle-tested implementation that handles Unicode correctly.

pub mod edit;
pub mod rope_buffer;
pub mod edit_stack;

pub use edit::{Position, EditRange, TextEdit, EditResult};
pub use rope_buffer::RopeBuffer;
pub use edit_stack::EditStack;

use std::borrow::Cow;

/// The core text buffer trait. Any implementation (Rope, PieceTree, Gap Buffer)
/// must satisfy this interface so the rest of the engine is implementation-agnostic.
pub trait TextBuffer: Send + Sync {
    // ── Metadata ────────────────────────────────────────────────────────────

    /// Total number of Unicode scalar values (chars) in the document.
    fn len_chars(&self) -> usize;

    /// Total number of lines. An empty document has 1 line.
    fn len_lines(&self) -> usize;

    /// Returns true if the document has no content.
    fn is_empty(&self) -> bool {
        self.len_chars() == 0
    }

    // ── Edits ───────────────────────────────────────────────────────────────

    /// Insert `text` at `char_idx` (0-indexed Unicode scalar index).
    /// O(log N) amortized.
    fn insert(&mut self, char_idx: usize, text: &str);

    /// Delete `len_chars` characters starting at `char_idx`.
    /// O(log N) amortized.
    fn delete(&mut self, char_idx: usize, len_chars: usize);

    /// Apply a structured edit (replace a range with new text).
    /// This is the primary mutation API — mirrors VS Code's `IIdentifiedSingleEditOperation`.
    fn apply_edit(&mut self, edit: &TextEdit) -> EditResult;

    // ── Line queries ─────────────────────────────────────────────────────────

    /// Get the content of a line (0-indexed), without the trailing newline.
    /// Returns `Cow::Borrowed` when the line lives in a single contiguous chunk
    /// (common for unmodified original-file regions), otherwise `Cow::Owned`.
    fn line_content(&self, line_idx: usize) -> Cow<'_, str>;

    /// Get the byte/char length of a line (excluding the line terminator).
    fn line_len(&self, line_idx: usize) -> usize;

    // ── Coordinate conversion ─────────────────────────────────────────────────

    /// Convert a char index to a (line, column) pair. Both are 0-indexed.
    fn char_to_line(&self, char_idx: usize) -> usize;

    /// Return the char index of the first character on `line_idx`.
    fn line_to_char(&self, line_idx: usize) -> usize;

    // ── Range queries ────────────────────────────────────────────────────────

    /// Extract a substring from `[char_start, char_end)` as a Cow<str>.
    fn slice(&self, char_start: usize, char_end: usize) -> Cow<'_, str>;

    /// Get multiple consecutive lines as owned strings (used by viewport renderer).
    fn lines_content(&self, start_line: usize, end_line: usize) -> Vec<String>;
}
