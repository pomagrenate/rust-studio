/// highlighter.rs — Tree-sitter highlight query runner.
///
/// Uses `tree-sitter-highlight` to walk the parsed tree and emit
/// `HighlightToken`s that map directly to TextMate-style CSS scopes.

use tree_sitter_highlight::{Highlight, HighlightConfiguration, HighlightEvent, Highlighter};
use super::types::HighlightToken;

// ── Highlight scope names ────────────────────────────────────────────────────
// These map tree-sitter capture names → TextMate scope strings the
// frontend uses for CSS coloring.
pub static HIGHLIGHT_NAMES: &[&str] = &[
    "attribute",
    "comment",
    "constant",
    "constant.builtin",
    "constructor",
    "embedded",
    "function",
    "function.builtin",
    "function.macro",
    "keyword",
    "keyword.control",
    "keyword.operator",
    "label",
    "module",
    "number",
    "operator",
    "property",
    "punctuation",
    "punctuation.bracket",
    "punctuation.delimiter",
    "string",
    "string.special",
    "tag",
    "type",
    "type.builtin",
    "variable",
    "variable.builtin",
    "variable.parameter",
];

// Each index maps to the TextMate CSS class the frontend will apply.
// MUST stay in the same order as `HIGHLIGHT_NAMES`.
pub static SCOPE_CSS_CLASSES: &[&str] = &[
    "hl-attribute",
    "hl-comment",
    "hl-constant",
    "hl-constant-builtin",
    "hl-constructor",
    "hl-embedded",
    "hl-function",
    "hl-function-builtin",
    "hl-function-macro",
    "hl-keyword",
    "hl-keyword-control",
    "hl-keyword-operator",
    "hl-label",
    "hl-module",
    "hl-number",
    "hl-operator",
    "hl-property",
    "hl-punctuation",
    "hl-punctuation-bracket",
    "hl-punctuation-delimiter",
    "hl-string",
    "hl-string-special",
    "hl-tag",
    "hl-type",
    "hl-type-builtin",
    "hl-variable",
    "hl-variable-builtin",
    "hl-variable-parameter",
];

/// Lazily-built, reusable Rust highlight configuration.
pub fn build_rust_highlight_config() -> Result<HighlightConfiguration, String> {
    let mut config = HighlightConfiguration::new(
        tree_sitter_rust::LANGUAGE.into(),
        "rust",
        tree_sitter_rust::HIGHLIGHTS_QUERY,
        tree_sitter_rust::INJECTIONS_QUERY,
        "", // tree_sitter_rust doesn't have a locals query exposed
    )
    .map_err(|e| format!("HighlightConfiguration error: {e}"))?;

    config.configure(HIGHLIGHT_NAMES);
    Ok(config)
}

/// Run the highlighter on `source` using the provided config.
/// Returns a flat list of tokens sorted by (line, col_start).
/// 
/// This is panic-safe: tree-sitter always produces a partial tree even on
/// malformed input, so errors are silently skipped.
pub fn highlight_source(
    highlighter: &mut Highlighter,
    config: &HighlightConfiguration,
    source: &str,
    _doc_id: &str,
) -> (Vec<HighlightToken>, bool) {
    let mut tokens: Vec<HighlightToken> = Vec::with_capacity(512);
    let mut has_errors = false;

    let events = match highlighter.highlight(config, source.as_bytes(), None, |_| None) {
        Ok(ev) => ev,
        Err(_) => return (tokens, true),
    };

    // Scope stack — tree-sitter may emit nested HighlightStart/End events.
    let mut scope_stack: Vec<&'static str> = Vec::with_capacity(8);
    let mut current_scope: Option<&'static str> = None;

    for event in events {
        match event {
            Ok(HighlightEvent::HighlightStart(Highlight(idx))) => {
                let scope = SCOPE_CSS_CLASSES
                    .get(idx)
                    .copied()
                    .unwrap_or("hl-plain");
                if let Some(prev) = current_scope {
                    scope_stack.push(prev);
                }
                current_scope = Some(scope);
            }
            Ok(HighlightEvent::HighlightEnd) => {
                current_scope = scope_stack.pop();
            }
            Ok(HighlightEvent::Source { start, end }) => {
                let scope = current_scope.unwrap_or("hl-plain");
                // Convert byte offsets → (line, col) by scanning the source.
                // This is O(n) but `source` is per-keypress delta; fine in practice.
                emit_tokens_for_range(source, start, end, scope, &mut tokens);
            }
            Err(_) => {
                has_errors = true;
            }
        }
    }

    (tokens, has_errors)
}

/// Convert a flat byte range [start, end) in `source` to one or more
/// `HighlightToken`s (splitting across newlines when needed).
fn emit_tokens_for_range(
    source: &str,
    start: usize,
    end: usize,
    scope: &'static str,
    out: &mut Vec<HighlightToken>,
) {
    if start >= end || start > source.len() {
        return;
    }

    let end = end.min(source.len());
    let text = &source[start..end];

    // Count lines before `start` to find starting row/col.
    let prefix = &source[..start];
    let start_row = prefix.bytes().filter(|&b| b == b'\n').count() as u32;
    let last_newline = prefix.rfind('\n').map(|p| p + 1).unwrap_or(0);
    let start_col = (start - last_newline) as u32;

    // Emit one token per line within the range.
    let mut row = start_row;
    let mut col = start_col;
    let mut line_start = 0usize;

    for (i, &b) in text.as_bytes().iter().enumerate() {
        if b == b'\n' {
            let col_end = col + (i - line_start) as u32;
            out.push(HighlightToken { line: row, col_start: col, col_end, scope: scope.to_string() });
            row += 1;
            col = 0;
            line_start = i + 1;
        }
    }

    // Last (or only) line segment.
    let col_end = col + (text.len() - line_start) as u32;
    if col_end > col {
        out.push(HighlightToken { line: row, col_start: col, col_end, scope: scope.to_string() });
    }
}
