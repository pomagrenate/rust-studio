/// commands/syntax_commands.rs — Tauri IPC bridge for the syntax engine.
///
/// Commands exposed to the frontend:
///   - `syntax_open_document`   → full parse on file open
///   - `syntax_update_document` → incremental re-parse on keypress
///   - `syntax_close_document`  → free parser state
///   - `syntax_highlight`       → run highlight query, return tokens

use tauri::State;
use std::sync::Arc;
use parking_lot::Mutex;
use tree_sitter_highlight::Highlighter;

use crate::syntax::{
    parser::SyntaxEngine,
    highlighter::{build_rust_highlight_config, highlight_source},
    types::{HighlightResult, TextEdit},
};
use tree_sitter_highlight::HighlightConfiguration;

/// App-managed state bundle: engine + per-thread highlighter + shared config.
pub struct SyntaxState {
    pub engine: Arc<SyntaxEngine>,
    /// One Highlighter per call (it has internal buffers, not Send+Sync).
    /// We wrap in Mutex so the single highlight thread serialises access.
    pub highlighter: Mutex<Highlighter>,
    pub rust_config: Arc<HighlightConfiguration>,
}

impl SyntaxState {
    pub fn new() -> Result<Self, String> {
        let rust_config = build_rust_highlight_config()?;
        Ok(Self {
            engine: Arc::new(SyntaxEngine::new()),
            highlighter: Mutex::new(Highlighter::new()),
            rust_config: Arc::new(rust_config),
        })
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

/// Called when the user opens a file. Performs a full parse.
#[tauri::command]
pub fn syntax_open_document(
    doc_id: String,
    path: String,
    source: String,
    state: State<'_, Arc<SyntaxState>>,
) {
    state.engine.open_document(&doc_id, &path, &source);
}

/// Called when the user types. Applies an incremental edit then re-parses.
#[tauri::command]
pub fn syntax_update_document(
    doc_id: String,
    edit: TextEdit,
    new_source: String,
    state: State<'_, Arc<SyntaxState>>,
) -> bool {
    state.engine.update_document(&doc_id, &edit, &new_source)
}

/// Called when the user closes a tab. Frees the cached parse tree.
#[tauri::command]
pub fn syntax_close_document(
    doc_id: String,
    state: State<'_, Arc<SyntaxState>>,
) {
    state.engine.close_document(&doc_id);
}

/// Run the full highlight pass on the current source text.
/// Returns a `HighlightResult` with all tokens.
///
/// This is intentionally stateless with respect to the source:
/// the caller must pass the full current content so highlighting
/// is always coherent even if an incremental update is still in flight.
#[tauri::command]
pub fn syntax_highlight(
    doc_id: String,
    source: String,
    state: State<'_, Arc<SyntaxState>>,
) -> HighlightResult {
    let mut highlighter = state.highlighter.lock();
    let (tokens, has_errors) =
        highlight_source(&mut highlighter, &state.rust_config, &source, &doc_id);

    HighlightResult { doc_id, tokens, has_errors }
}
