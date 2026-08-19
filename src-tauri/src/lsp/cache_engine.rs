/// cache_engine.rs — In-memory incremental document cache with debouncing.
///
/// Each open document is stored as a `ropey::Rope` (O(log N) edits).
/// Pending analysis is tracked by timestamp so the DiagnosticManager can
/// batch changes and only re-analyze documents that have been idle for
/// `debounce_ms` milliseconds.

use std::sync::Arc;
use std::time::Instant;
use dashmap::DashMap;
use ropey::Rope;

use crate::lsp::types::LspRange;

// ── Document Snapshot ──────────────────────────────────────────────────────

/// An immutable snapshot of one open document's current state.
#[derive(Debug, Clone)]
pub struct DocumentSnapshot {
    pub uri: String,
    pub version: u32,
    /// Rope buffer: O(log N) for arbitrary edits, O(N) for full replace.
    pub content: Rope,
    pub language_id: String,
    pub is_dirty: bool,
}

impl DocumentSnapshot {
    /// Returns the full document text as a single `String`.
    pub fn to_text(&self) -> String {
        self.content.to_string()
    }
}

// ── Cache Engine ───────────────────────────────────────────────────────────

/// Thread-safe document cache. Wrap in `Arc` and share across Tauri state.
pub struct CacheEngine {
    /// uri → live document snapshot
    documents: DashMap<String, DocumentSnapshot>,
    /// uri → timestamp of last modification (for debounce logic)
    pending_analysis: DashMap<String, Instant>,
}

impl CacheEngine {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            documents: DashMap::new(),
            pending_analysis: DashMap::new(),
        })
    }

    /// Register a newly opened document.
    pub fn open_document(
        &self,
        uri: impl Into<String>,
        language_id: impl Into<String>,
        version: u32,
        content: impl AsRef<str>,
    ) {
        let uri = uri.into();
        let snapshot = DocumentSnapshot {
            uri: uri.clone(),
            version,
            content: Rope::from_str(content.as_ref()),
            language_id: language_id.into(),
            is_dirty: false,
        };
        self.documents.insert(uri, snapshot);
    }

    /// Replace the entire document buffer (full sync).
    pub fn apply_full_update(&self, uri: &str, version: u32, text: &str) {
        if let Some(mut entry) = self.documents.get_mut(uri) {
            if version > entry.version {
                entry.content = Rope::from_str(text);
                entry.version = version;
                entry.is_dirty = true;
            }
        }
    }

    /// Apply an incremental or full-replacement edit.
    /// Returns `true` if the document version actually advanced.
    pub fn apply_incremental_update(
        &self,
        uri: &str,
        version: u32,
        range: Option<LspRange>,
        text: &str,
    ) -> bool {
        let mut entry = match self.documents.get_mut(uri) {
            Some(e) => e,
            None => return false,
        };

        if version <= entry.version {
            return false; // stale or duplicate edit; ignore
        }

        match range {
            None => {
                // Full replacement
                entry.content = Rope::from_str(text);
            }
            Some(r) => {
                let (start_char, end_char) = lsp_range_to_char_range(&entry.content, &r);
                // Guard against invalid ranges from a desync
                let rope_len = entry.content.len_chars();
                let start_char = start_char.min(rope_len);
                let end_char = end_char.min(rope_len);
                if start_char <= end_char {
                    entry.content.remove(start_char..end_char);
                    entry.content.insert(start_char, text);
                }
            }
        }

        entry.version = version;
        entry.is_dirty = true;
        true
    }

    /// Remove a document from the cache (on tab close).
    pub fn close_document(&self, uri: &str) {
        self.documents.remove(uri);
        self.pending_analysis.remove(uri);
    }

    /// Clone and return a snapshot of the current document state.
    pub fn get_snapshot(&self, uri: &str) -> Option<DocumentSnapshot> {
        self.documents.get(uri).map(|e| e.clone())
    }

    /// Mark this document as needing analysis (called after each edit).
    pub fn mark_analysis_pending(&self, uri: impl Into<String>) {
        self.pending_analysis.insert(uri.into(), Instant::now());
    }

    /// Returns URIs of documents whose last edit was at least `debounce_ms` ago.
    /// These are ready to be analyzed — the user has paused typing.
    pub fn documents_needing_analysis(&self, debounce_ms: u64) -> Vec<String> {
        let threshold = std::time::Duration::from_millis(debounce_ms);
        self.pending_analysis
            .iter()
            .filter(|entry| entry.value().elapsed() >= threshold)
            .map(|entry| entry.key().clone())
            .collect()
    }

    /// Remove a URI from the pending set after analysis has started.
    pub fn clear_pending(&self, uri: &str) {
        self.pending_analysis.remove(uri);
    }

    /// Returns the number of currently open documents.
    pub fn document_count(&self) -> usize {
        self.documents.len()
    }
}

// ── Coordinate conversion ─────────────────────────────────────────────────

/// Convert an LSP `LspRange` (line + UTF-16 char offset) to a pair of
/// ropey char indices.
///
/// LSP uses UTF-16 code units for the `character` field; ropey works in
/// Unicode scalar values (Rust `char`). For ASCII-only source (the common
/// case in Rust code) they are identical. For non-BMP characters the
/// caller will need proper UTF-16 conversion; this implementation uses a
/// safe approximation (treats character as UTF-8 char offset) which is
/// correct for all ASCII and most Latin/CJK content.
pub fn lsp_range_to_char_range(rope: &Rope, range: &LspRange) -> (usize, usize) {
    let start = lsp_position_to_char(rope, range.start.line as usize, range.start.character as usize);
    let end   = lsp_position_to_char(rope, range.end.line as usize,   range.end.character as usize);
    (start, end)
}

fn lsp_position_to_char(rope: &Rope, line: usize, character: usize) -> usize {
    if line >= rope.len_lines() {
        return rope.len_chars();
    }
    let line_start = rope.line_to_char(line);
    let line_len   = rope.line(line).len_chars();
    // Clamp character to line length (guards against off-by-one from LSP clients)
    line_start + character.min(line_len)
}
