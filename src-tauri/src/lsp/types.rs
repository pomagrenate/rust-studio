/// lsp/types.rs — Serializable types shared across the LSP subsystem and Tauri command bridge.

use serde::{Deserialize, Serialize};

// ── Core LSP primitives ────────────────────────────────────────────────────

/// A `file://` URI identifying a document (opaque string, not validated).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub struct LspDocumentUri(pub String);

impl From<&str> for LspDocumentUri {
    fn from(s: &str) -> Self { Self(s.to_string()) }
}

impl From<String> for LspDocumentUri {
    fn from(s: String) -> Self { Self(s) }
}

/// 0-indexed line + UTF-16 character offset (LSP standard).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LspPosition {
    pub line: u32,
    pub character: u32,
}

/// Half-open source range [start, end).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LspRange {
    pub start: LspPosition,
    pub end: LspPosition,
}

// ── Diagnostics ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
#[serde(rename_all = "PascalCase")]
pub enum DiagnosticSeverity {
    Error       = 1,
    Warning     = 2,
    Information = 3,
    Hint        = 4,
}

impl Default for DiagnosticSeverity {
    fn default() -> Self { Self::Error }
}

/// One compiler/borrow-checker diagnostic.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Diagnostic {
    pub uri: String,
    pub range: LspRange,
    pub severity: DiagnosticSeverity,
    /// E.g. "E0308" for rustc errors.
    pub code: Option<String>,
    pub message: String,
    /// "rustc" | "rust-analyzer" | "clippy" etc.
    pub source: Option<String>,
}

/// A complete set of diagnostics for one document version.
/// The frontend replaces all previous markers for this `uri` when it receives this.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiagnosticBatch {
    pub uri: String,
    pub version: u32,
    pub diagnostics: Vec<Diagnostic>,
}

// ── Document Sync ─────────────────────────────────────────────────────────

/// One incremental (or full) text change from the editor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextDocumentContentChangeEvent {
    /// If `None`, this is a full-document replacement.
    pub range: Option<LspRange>,
    pub text: String,
}

/// Tauri command payload sent by the frontend on every edit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSyncPayload {
    pub uri: String,
    pub version: u32,
    pub changes: Vec<TextDocumentContentChangeEvent>,
    /// Full document text, sent alongside changes so the backend can
    /// re-sync from scratch if an incremental apply ever desynchronises.
    pub full_text: Option<String>,
}

// ── LSP Feature Results ───────────────────────────────────────────────────

/// What the connected RA server supports.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LspCapabilities {
    pub hover: bool,
    pub goto_definition: bool,
    pub goto_implementation: bool,
    pub completion: bool,
    pub diagnostics: bool,
}

/// Current lifecycle state of the LSP host, forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LspStatus {
    Starting,
    Ready,
    Indexing { percent: u8 },
    Error { message: String },
    Stopped,
}

impl Default for LspStatus {
    fn default() -> Self { Self::Stopped }
}

/// Hover documentation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoverResult {
    pub uri: String,
    pub range: LspRange,
    /// Markdown-formatted documentation string.
    pub content: String,
}

/// One entry in a completion list.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompletionItem {
    pub label: String,
    /// E.g. "Function", "Variable", "Keyword".
    pub kind: Option<String>,
    pub detail: Option<String>,
    pub insert_text: String,
    pub documentation: Option<String>,
}

/// A definition location.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GotoDefinitionResult {
    pub uri: String,
    pub range: LspRange,
}

/// LocationLink for more precise definition navigation (LSP 3.14+)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationLink {
    pub target_uri: String,
    pub target_range: LspRange,
    pub target_selection_range: LspRange,
    pub origin_selection_range: Option<LspRange>,
}

/// Resolved definition with virtual file support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedDefinition {
    pub uri: String,
    pub range: LspRange,
    pub is_virtual: bool,
    pub content: Option<String>,
    pub language_id: String,
}

/// Rust-src installation status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustSrcStatus {
    pub installed: bool,
    pub sysroot: String,
    pub rust_src_path: String,
}

// ── Code Actions ───────────────────────────────────────────────────────────

/// Code action kind (LSP standard)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum CodeActionKind {
    /// Known kinds
    Known(String),
    /// Unknown kind
    Unknown(String),
}

impl Default for CodeActionKind {
    fn default() -> Self { Self::Unknown(String::new()) }
}

/// A text edit to apply to a document
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TextEdit {
    pub range: LspRange,
    pub new_text: String,
}

/// A document change in a workspace edit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChange {
    pub uri: String,
    pub edits: Vec<TextEdit>,
}

/// A workspace edit that can span multiple documents
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceEdit {
    pub document_changes: Vec<DocumentChange>,
}

/// A command to execute on the client side
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub title: String,
    pub command: String,
    pub arguments: Option<Vec<serde_json::Value>>,
}

/// A code action that can be applied
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeAction {
    pub title: String,
    pub kind: Option<CodeActionKind>,
    /// Either a workspace edit or a command
    pub edit: Option<WorkspaceEdit>,
    pub command: Option<Command>,
    /// Whether this action is preferred
    pub is_preferred: Option<bool>,
}
