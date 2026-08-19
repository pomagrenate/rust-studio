/// parser.rs — Incremental Tree-sitter parser state manager.
///
/// One `DocumentParser` lives per open document in the `SyntaxEngine`.
/// It owns the live `Tree` and updates it efficiently on every keystroke
/// using tree-sitter's built-in incremental re-parsing.

use parking_lot::Mutex;
use tree_sitter::{InputEdit, Language, Node, Parser, Point, Tree};
use super::types::TextEdit;

/// One parser + tree per open document.
pub struct DocumentParser {
    parser: Parser,
    tree: Option<Tree>,
}

impl DocumentParser {
    /// Create a new parser initialised with the given tree-sitter language.
    pub fn new(language: Language) -> Result<Self, String> {
        let mut parser = Parser::new();
        parser
            .set_language(&language)
            .map_err(|e| format!("Failed to set language: {e}"))?;
        Ok(Self { parser, tree: None })
    }

    /// Full re-parse (used on first open or after a hard reset).
    pub fn full_parse(&mut self, source: &str) {
        self.tree = self.parser.parse(source, None);
    }

    /// Incremental re-parse: apply one `TextEdit`, then re-parse only the
    /// affected subtree.  Returns `false` if the tree couldn't be updated.
    pub fn apply_edit_and_reparse(&mut self, edit: &TextEdit, new_source: &str) -> bool {
        let input_edit = InputEdit {
            start_byte: edit.start_byte,
            old_end_byte: edit.old_end_byte,
            new_end_byte: edit.new_end_byte,
            start_position: Point {
                row: edit.start_position[0],
                column: edit.start_position[1],
            },
            old_end_position: Point {
                row: edit.old_end_position[0],
                column: edit.old_end_position[1],
            },
            new_end_position: Point {
                row: edit.new_end_position[0],
                column: edit.new_end_position[1],
            },
        };

        if let Some(ref mut tree) = self.tree {
            tree.edit(&input_edit);
        }

        self.tree = self.parser.parse(new_source, self.tree.as_ref());
        self.tree.is_some()
    }

    /// Returns the root node of the current tree, if any.
    pub fn root_node(&self) -> Option<Node<'_>> {
        self.tree.as_ref().map(|t| t.root_node())
    }

    /// True if the current tree contains any parse errors.
    pub fn has_errors(&self) -> bool {
        self.tree
            .as_ref()
            .map(|t| t.root_node().has_error())
            .unwrap_or(false)
    }
}

/// Thread-safe registry: `doc_id → DocumentParser`.
/// Use `Arc<SyntaxEngine>` as Tauri managed state.
pub struct SyntaxEngine {
    parsers: dashmap::DashMap<String, Mutex<DocumentParser>>,
}

impl SyntaxEngine {
    pub fn new() -> Self {
        Self {
            parsers: dashmap::DashMap::new(),
        }
    }

    /// Returns the language for a file path, defaulting to Rust for unknown.
    fn language_for_path(path: &str) -> Option<Language> {
        let ext = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        match ext {
            "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
            // Future: add tree-sitter-toml, tree-sitter-json, etc.
            _ => None,
        }
    }

    /// Open a document: create parser, do full parse.
    pub fn open_document(&self, doc_id: &str, path: &str, source: &str) {
        let language = Self::language_for_path(path)
            .unwrap_or_else(|| tree_sitter_rust::LANGUAGE.into());

        if let Ok(mut dp) = DocumentParser::new(language) {
            dp.full_parse(source);
            self.parsers
                .insert(doc_id.to_string(), Mutex::new(dp));
        }
    }

    /// Close a document: drop the parser + cached tree.
    pub fn close_document(&self, doc_id: &str) {
        self.parsers.remove(doc_id);
    }

    /// Apply an incremental edit and re-parse.
    /// Returns `true` on success.
    pub fn update_document(
        &self,
        doc_id: &str,
        edit: &TextEdit,
        new_source: &str,
    ) -> bool {
        if let Some(entry) = self.parsers.get(doc_id) {
            let mut dp = entry.lock();
            return dp.apply_edit_and_reparse(edit, new_source);
        }
        false
    }

    /// Retrieve a shared reference to the parser mutex for a document.
    /// The caller can lock it to inspect the tree.
    pub fn get(&self, doc_id: &str) -> Option<dashmap::mapref::one::Ref<'_, String, Mutex<DocumentParser>>> {
        self.parsers.get(doc_id)
    }
}
