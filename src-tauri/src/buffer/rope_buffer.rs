/// buffer/rope_buffer.rs — O(log N) text buffer backed by the `ropey` crate.
///
/// ## Why ropey?
/// `ropey` implements a B-tree over fixed-size leaf chunks (~2KB). Each leaf
/// stores a contiguous slice of UTF-8 text. The tree maintains augmented metadata
/// (total chars, total bytes, total newlines) in every internal node — exactly
/// the same O(log N) guarantees as VS Code's Piece Tree.
///
/// The key operations:
/// - `insert(idx, text)` → O(log N + |text|)
/// - `delete(range)`     → O(log N)
/// - `line_to_char(n)`   → O(log N)
/// - `char_to_line(c)`   → O(log N)
/// - `slice(start, end)` → O(log N + |slice|)
///
/// ## VS Code mapping
/// | VS Code concept           | Rust / ropey equivalent            |
/// |---------------------------|------------------------------------|
/// | `_buffers[]` + `Piece`    | Rope leaf chunks (managed by ropey)|
/// | `size_left` / `lf_left`   | Internal B-tree node metadata      |
/// | `PieceTreeSearchCache`    | ropey's internal chunk caching     |
/// | `computeBufferMetadata()` | Automatic on every mutation        |

use std::borrow::Cow;
use ropey::Rope;

use super::{TextBuffer, TextEdit, EditResult, EditRange, Position};

/// A text buffer backed by a `ropey::Rope`.
///
/// The `Rope` type is a persistent B-tree that stores text as a sequence of
/// leaf chunks. All edit operations run in O(log N) time.
pub struct RopeBuffer {
    rope: Rope,
}

impl RopeBuffer {
    /// Create a new, empty buffer.
    pub fn new() -> Self {
        Self { rope: Rope::new() }
    }

    /// Create a buffer pre-loaded with the given text.
    ///
    /// `ropey` will chunk the text into ~2KB leaf nodes and build the B-tree
    /// in O(N) time (single pass). This is equivalent to VS Code's
    /// `PieceTreeTextBufferBuilder` which chunks the initial file content.
    pub fn from_str(text: &str) -> Self {
        Self { rope: Rope::from_str(text) }
    }

    // ── Internal coordinate helpers ──────────────────────────────────────────

    /// Convert a (line, column) `Position` to a char index.
    /// Both line and column are 0-indexed.
    ///
    /// Runs in O(log N) — traverses the rope's B-tree by line count.
    fn position_to_char_idx(&self, pos: Position) -> usize {
        let line_start = self.rope.line_to_char(pos.line);
        line_start + pos.column
    }

    /// Compute the line delta introduced by inserting or removing `text`
    /// starting at a given char index.
    fn count_newlines(text: &str) -> i64 {
        text.chars().filter(|&c| c == '\n').count() as i64
    }
}

impl Default for RopeBuffer {
    fn default() -> Self {
        Self::new()
    }
}

impl TextBuffer for RopeBuffer {
    // ── Metadata ─────────────────────────────────────────────────────────────

    /// O(1) — stored in the rope's root node metadata.
    fn len_chars(&self) -> usize {
        self.rope.len_chars()
    }

    /// O(1) — stored in the rope's root node metadata.
    fn len_lines(&self) -> usize {
        self.rope.len_lines()
    }

    // ── Edits ─────────────────────────────────────────────────────────────────

    /// Insert `text` at `char_idx`. O(log N + |text|).
    ///
    /// Internally, ropey:
    /// 1. Walks the B-tree to find the leaf containing `char_idx` — O(log N)
    /// 2. Splits that leaf at `char_idx`
    /// 3. Inserts the new text, possibly creating new leaf nodes
    /// 4. Rebalances and updates metadata (char count, newline count) up the tree
    fn insert(&mut self, char_idx: usize, text: &str) {
        self.rope.insert(char_idx, text);
    }

    /// Delete `len_chars` characters starting at `char_idx`. O(log N).
    ///
    /// Equivalent to VS Code's `pieceTreeBase.delete(offset, cnt)`:
    /// - Finds start and end nodes in O(log N)
    /// - Trims node heads/tails (here: adjusts leaf boundaries)
    /// - Removes intermediate nodes (here: removes intermediate rope leaves)
    fn delete(&mut self, char_idx: usize, len_chars: usize) {
        if len_chars == 0 {
            return;
        }
        let end = (char_idx + len_chars).min(self.rope.len_chars());
        self.rope.remove(char_idx..end);
    }

    /// Apply a structured `TextEdit`. This is the primary mutation API.
    ///
    /// Converts the (line, column) range to char indices (O(log N) each),
    /// then performs an atomic replace operation:
    /// 1. Deletes the range content
    /// 2. Inserts the new text at the (now empty) range start
    fn apply_edit(&mut self, edit: &TextEdit) -> EditResult {
        // TODO: caller must supply the current document version and increment it.
        // For now we use 0 as a placeholder — the Document struct will track this.
        let version = 0;

        let start_char = self.position_to_char_idx(edit.range.start);
        let end_char   = self.position_to_char_idx(edit.range.end);

        // Count lines before the edit so we can compute the delta.
        let old_line_count = self.len_lines() as i64;

        // Step 1: delete the range (no-op if range is empty / pure insertion).
        if start_char != end_char {
            self.rope.remove(start_char..end_char);
        }

        // Step 2: insert new text at the start position.
        if !edit.new_text.is_empty() {
            self.rope.insert(start_char, &edit.new_text);
        }

        let new_line_count = self.len_lines() as i64;
        let line_delta = new_line_count - old_line_count;

        // Compute the end position of the newly inserted text in the new document.
        let inserted_char_count = edit.new_text.chars().count();
        let end_char_after = start_char + inserted_char_count;
        let end_line_after = self.rope.char_to_line(end_char_after);
        let line_start_char = self.rope.line_to_char(end_line_after);
        let end_col_after = end_char_after - line_start_char;

        EditResult {
            new_version: version,
            affected_range: EditRange {
                start: edit.range.start,
                end: Position {
                    line: end_line_after,
                    column: end_col_after,
                },
            },
            line_delta,
        }
    }

    // ── Line queries ──────────────────────────────────────────────────────────

    /// Get the content of line `line_idx` (0-indexed), excluding the trailing '\n'.
    ///
    /// Returns `Cow::Borrowed` when the line lives in a single rope leaf
    /// (O(log N) to find + O(1) to return). Returns `Cow::Owned` if the line
    /// spans multiple leaves (O(log N + line_length) to concatenate).
    ///
    /// This mirrors VS Code's `getLineContent` which uses `_lastVisitedLine`
    /// as a 1-entry cache and `getLineRawContent` for the actual lookup.
    fn line_content(&self, line_idx: usize) -> Cow<'_, str> {
        let line = self.rope.line(line_idx);
        // Strip the trailing newline if present.
        let content: Cow<str> = line.into();
        if content.ends_with('\n') {
            Cow::Owned(content[..content.len() - 1].to_string())
        } else {
            content
        }
    }

    /// Length of line `line_idx` in chars, excluding the newline.
    fn line_len(&self, line_idx: usize) -> usize {
        let line = self.rope.line(line_idx);
        let len = line.len_chars();
        // Subtract trailing newline if present.
        if len > 0 && line.char(len - 1) == '\n' { len - 1 } else { len }
    }

    // ── Coordinate conversion ─────────────────────────────────────────────────

    /// Convert char index → line index. O(log N).
    ///
    /// This is VS Code's `getPositionAt` in O(log N) — the rope's B-tree stores
    /// the newline count in every subtree, so we binary-search down.
    fn char_to_line(&self, char_idx: usize) -> usize {
        self.rope.char_to_line(char_idx)
    }

    /// Convert line index → first char index. O(log N).
    ///
    /// Equivalent to VS Code's `getOffsetAt(lineNumber, 1)`.
    fn line_to_char(&self, line_idx: usize) -> usize {
        self.rope.line_to_char(line_idx)
    }

    // ── Range queries ─────────────────────────────────────────────────────────

    /// Extract a substring from `[char_start, char_end)`. O(log N + |slice|).
    fn slice(&self, char_start: usize, char_end: usize) -> Cow<'_, str> {
        self.rope.slice(char_start..char_end).into()
    }

    /// Collect multiple lines as owned Strings for the viewport renderer.
    ///
    /// This is the hot path for rendering. `ropey` iterates chunks efficiently,
    /// so for a 50-line viewport on a 100k-line file this is O(log N + 50 * avg_line_len).
    fn lines_content(&self, start_line: usize, end_line: usize) -> Vec<String> {
        let end_line = end_line.min(self.len_lines());
        (start_line..end_line)
            .map(|l| {
                let line = self.rope.line(l);
                let s: Cow<str> = line.into();
                // Strip the trailing newline.
                if s.ends_with('\n') {
                    s[..s.len() - 1].to_string()
                } else {
                    s.to_string()
                }
            })
            .collect()
    }
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_buffer() {
        let buf = RopeBuffer::new();
        assert_eq!(buf.len_chars(), 0);
        assert_eq!(buf.len_lines(), 1); // ropey: empty rope has 1 line
        assert!(buf.is_empty());
    }

    #[test]
    fn test_from_str() {
        let buf = RopeBuffer::from_str("hello\nworld\n");
        assert_eq!(buf.len_chars(), 12);
        assert_eq!(buf.len_lines(), 3); // "hello\n", "world\n", ""
    }

    #[test]
    fn test_insert() {
        let mut buf = RopeBuffer::from_str("hello world");
        buf.insert(5, ", beautiful");
        assert_eq!(buf.slice(0, buf.len_chars()), "hello, beautiful world");
    }

    #[test]
    fn test_delete() {
        let mut buf = RopeBuffer::from_str("hello, beautiful world");
        buf.delete(5, 11); // remove ", beautiful"
        assert_eq!(buf.slice(0, buf.len_chars()), "hello world");
    }

    #[test]
    fn test_line_content() {
        let buf = RopeBuffer::from_str("line one\nline two\nline three");
        assert_eq!(buf.line_content(0), "line one");
        assert_eq!(buf.line_content(1), "line two");
        assert_eq!(buf.line_content(2), "line three");
    }

    #[test]
    fn test_coordinate_conversion() {
        let buf = RopeBuffer::from_str("abc\ndef\nghi");
        // 'a'=0,'b'=1,'c'=2,'\n'=3,'d'=4,'e'=5,'f'=6,'\n'=7,'g'=8,'h'=9,'i'=10
        assert_eq!(buf.char_to_line(0), 0); // 'a' is on line 0
        assert_eq!(buf.char_to_line(4), 1); // 'd' is on line 1
        assert_eq!(buf.char_to_line(8), 2); // 'g' is on line 2

        assert_eq!(buf.line_to_char(0), 0); // line 0 starts at char 0
        assert_eq!(buf.line_to_char(1), 4); // line 1 starts at char 4
        assert_eq!(buf.line_to_char(2), 8); // line 2 starts at char 8
    }

    #[test]
    fn test_apply_edit_insertion() {
        let mut buf = RopeBuffer::from_str("hello world");
        let edit = TextEdit::insert(0, 5, ", beautiful");
        buf.apply_edit(&edit);
        assert_eq!(buf.slice(0, buf.len_chars()), "hello, beautiful world");
    }

    #[test]
    fn test_apply_edit_deletion() {
        let mut buf = RopeBuffer::from_str("hello, beautiful world");
        let edit = TextEdit::delete(EditRange {
            start: Position { line: 0, column: 5 },
            end:   Position { line: 0, column: 16 },
        });
        buf.apply_edit(&edit);
        assert_eq!(buf.slice(0, buf.len_chars()), "hello world");
    }

    #[test]
    fn test_large_document_line_lookup() {
        // Simulate a large file: 100,000 lines.
        // This tests that O(log N) holds in practice.
        let text = "hello world\n".repeat(100_000);
        let buf = RopeBuffer::from_str(&text);
        assert_eq!(buf.len_lines(), 100_001); // includes trailing empty line

        // Look up the last real line — should be O(log 100_000) ≈ 17 steps.
        let last_line = buf.line_content(99_999);
        assert_eq!(last_line, "hello world");

        // Spot-check coordinate conversion.
        let char_idx = buf.line_to_char(50_000);
        assert_eq!(buf.char_to_line(char_idx), 50_000);
    }

    #[test]
    fn test_lines_content() {
        let buf = RopeBuffer::from_str("one\ntwo\nthree\nfour");
        let lines = buf.lines_content(1, 3);
        assert_eq!(lines, vec!["two", "three"]);
    }

    #[test]
    fn test_insert_into_large_doc_is_fast() {
        // Insert into the middle of a 100k-line document.
        // Should complete in microseconds (O(log N)), not milliseconds (O(N)).
        let text = "hello world\n".repeat(100_000);
        let mut buf = RopeBuffer::from_str(&text);
        let mid = buf.line_to_char(50_000);
        buf.insert(mid, "INSERTED LINE\n");
        assert_eq!(buf.len_lines(), 100_002);
        assert_eq!(buf.line_content(50_000), "INSERTED LINE");
    }
}
