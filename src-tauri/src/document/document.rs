/// document/document.rs — The Document model.
///
/// A Document owns a TextBuffer and all metadata about an open file.
/// It is the Rust equivalent of VS Code's `TextModel`.

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::buffer::{RopeBuffer, TextBuffer, TextEdit, EditResult, EditStack, Position};

/// End-of-line style. Detected on open; normalised on save if configured.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EolStyle {
    Lf,   // Unix: \n
    CrLf, // Windows: \r\n
    Cr,   // Classic Mac: \r (rare)
}

impl EolStyle {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Lf   => "\n",
            Self::CrLf => "\r\n",
            Self::Cr   => "\r",
        }
    }

    /// Detect the dominant line ending in a text sample.
    pub fn detect(text: &str) -> Self {
        let crlf = text.matches("\r\n").count();
        let cr   = text.matches('\r').count() - crlf;
        let lf   = text.matches('\n').count() - crlf;

        if crlf >= lf && crlf >= cr {
            Self::CrLf
        } else if cr > lf {
            Self::Cr
        } else {
            Self::Lf
        }
    }
}

/// File encoding. We only support UTF-8 for now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Encoding {
    Utf8,
    Utf8Bom,
}

/// An open document — owns the text buffer and all related metadata.
pub struct Document {
    /// Absolute path on disk. `None` for untitled buffers.
    pub path: Option<PathBuf>,

    /// The text buffer — O(log N) insert/delete, O(log N) line lookup.
    pub buffer: RopeBuffer,

    /// Monotonically increasing version counter. Incremented on every edit.
    /// Used for change notification and undo/redo.
    pub version: u64,

    /// The line ending style of this document.
    pub eol: EolStyle,

    /// The encoding.
    pub encoding: Encoding,

    /// True if the buffer has unsaved changes.
    pub is_dirty: bool,

    /// Undo/redo stack for this document.
    pub edit_stack: EditStack,
}

impl Document {
    /// Create a new, empty, untitled document.
    pub fn new_untitled() -> Self {
        Self {
            path: None,
            buffer: RopeBuffer::new(),
            version: 0,
            eol: EolStyle::Lf,
            encoding: Encoding::Utf8,
            is_dirty: false,
            edit_stack: EditStack::new(),
        }
    }

    /// Create a document from raw UTF-8 file content.
    ///
    /// This normalises \r\n → \n internally in the rope so all callers work
    /// with a clean single-char newline. The original EOL style is remembered
    /// for serialisation back to disk.
    ///
    /// This mirrors VS Code's `PieceTreeTextBufferBuilder.finish()` which
    /// normalises EOL and builds the initial piece tree from the file chunks.
    pub fn from_content(content: &str, path: Option<PathBuf>) -> Self {
        let eol = EolStyle::detect(content);

        // Normalise to \n for the internal rope representation.
        let normalised = match eol {
            EolStyle::Lf   => content.to_string(),
            EolStyle::CrLf => content.replace("\r\n", "\n"),
            EolStyle::Cr   => content.replace('\r', "\n"),
        };

        Self {
            path,
            buffer: RopeBuffer::from_str(&normalised),
            version: 0,
            eol,
            encoding: Encoding::Utf8,
            is_dirty: false,
            edit_stack: EditStack::new(),
        }
    }

    /// Apply a structured edit to the document.
    /// Increments the version counter and marks the document dirty.
    /// Also pushes to the undo stack with cursor position tracking.
    pub fn apply_edit(&mut self, edit: &TextEdit, cursor_before: Option<Position>) -> EditResult {
        let mut result = self.buffer.apply_edit(edit);
        self.version += 1;
        result.new_version = self.version;
        self.is_dirty = true;
        
        // Push to undo stack
        self.edit_stack.push_edit(edit.clone(), result.clone(), cursor_before);
        
        result
    }

    /// Undo the last edit.
    /// Returns the edit to apply to reverse the last operation and the cursor position.
    pub fn undo(&mut self) -> Option<(TextEdit, Position)> {
        self.edit_stack.pop_undo()
    }

    /// Redo the last undone edit.
    /// Returns the edit to re-apply and its result.
    pub fn redo(&mut self) -> Option<(TextEdit, EditResult)> {
        self.edit_stack.pop_redo()
    }

    /// Check if undo is available.
    pub fn can_undo(&self) -> bool {
        self.edit_stack.can_undo()
    }

    /// Check if redo is available.
    pub fn can_redo(&self) -> bool {
        self.edit_stack.can_redo()
    }

    /// Serialise the buffer content back to a string for saving,
    /// using the document's original line ending style.
    pub fn to_disk_content(&self) -> String {
        let raw: std::borrow::Cow<str> = self.buffer.slice(0, self.buffer.len_chars());
        match self.eol {
            EolStyle::Lf   => raw.into_owned(),
            EolStyle::CrLf => raw.replace('\n', "\r\n"),
            EolStyle::Cr   => raw.replace('\n', "\r"),
        }
    }

    /// A JSON-friendly summary for the frontend.
    pub fn info(&self) -> DocumentInfo {
        DocumentInfo {
            path: self.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
            version: self.version,
            line_count: self.buffer.len_lines(),
            char_count: self.buffer.len_chars(),
            eol: self.eol,
            is_dirty: self.is_dirty,
        }
    }
}

/// A JSON-serialisable summary of a document — sent to the frontend.
#[derive(Debug, Serialize)]
pub struct DocumentInfo {
    pub path: Option<String>,
    pub version: u64,
    pub line_count: usize,
    pub char_count: usize,
    pub eol: EolStyle,
    pub is_dirty: bool,
}
