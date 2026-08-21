//! lsp/tests.rs — Unit tests for LSP types and CacheEngine.

use super::types::*;
use super::cache_engine::CacheEngine;

#[test]
fn test_lsp_types_serde_roundtrip() {
    let uri = LspDocumentUri::from("file:///src/main.rs");
    assert_eq!(uri.0, "file:///src/main.rs");

    let diag = Diagnostic {
        uri: uri.0.clone(),
        range: LspRange {
            start: LspPosition { line: 10, character: 4 },
            end: LspPosition { line: 10, character: 12 },
        },
        severity: DiagnosticSeverity::Error,
        code: Some("E0308".to_string()),
        message: "mismatched types".to_string(),
        source: Some("rustc".to_string()),
    };

    let json = serde_json::to_string(&diag).unwrap();
    let deserialized: Diagnostic = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.uri, "file:///src/main.rs");
    assert_eq!(deserialized.severity, DiagnosticSeverity::Error);
    assert_eq!(deserialized.code.as_deref(), Some("E0308"));
}

#[test]
fn test_cache_engine_document_lifecycle_and_updates() {
    let cache = CacheEngine::new();
    assert_eq!(cache.document_count(), 0);

    let uri = "file:///src/app.rs";
    cache.open_document(uri, "rust", 1, "fn main() {}");

    assert_eq!(cache.document_count(), 1);
    let snapshot = cache.get_snapshot(uri).unwrap();
    assert_eq!(snapshot.to_text(), "fn main() {}");
    assert_eq!(snapshot.version, 1);

    // Apply incremental update
    let edit_range = LspRange {
        start: LspPosition { line: 0, character: 3 },
        end: LspPosition { line: 0, character: 7 },
    };

    let updated = cache.apply_incremental_update(uri, 2, Some(edit_range), "_test");
    assert!(updated);

    let snapshot2 = cache.get_snapshot(uri).unwrap();
    assert_eq!(snapshot2.to_text(), "fn _test() {}");
    assert_eq!(snapshot2.version, 2);

    // Close document
    cache.close_document(uri);
    assert_eq!(cache.document_count(), 0);
    assert!(cache.get_snapshot(uri).is_none());
}
