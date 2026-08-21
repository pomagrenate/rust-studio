//! document/tests.rs — Unit and integration tests for Document and DocumentRegistry.

use super::*;
use crate::buffer::{Position, EditRange, TextEdit, TextBuffer};
use std::sync::Arc;
use std::thread;

#[test]
fn test_eol_style_detection_and_as_str() {
    assert_eq!(EolStyle::detect("hello\nworld\n"), EolStyle::Lf);
    assert_eq!(EolStyle::detect("hello\r\nworld\r\n"), EolStyle::CrLf);
    assert_eq!(EolStyle::detect("hello\rworld\r"), EolStyle::Cr);
    assert_eq!(EolStyle::detect("plain text"), EolStyle::CrLf);

    assert_eq!(EolStyle::Lf.as_str(), "\n");
    assert_eq!(EolStyle::CrLf.as_str(), "\r\n");
    assert_eq!(EolStyle::Cr.as_str(), "\r");
}

#[test]
fn test_document_new_untitled() {
    let doc = Document::new_untitled();
    assert!(doc.path.is_none());
    assert_eq!(doc.version, 0);
    assert_eq!(doc.eol, EolStyle::Lf);
    assert_eq!(doc.encoding, Encoding::Utf8);
    assert!(!doc.is_dirty);
    assert!(!doc.can_undo());
    assert!(!doc.can_redo());
}

#[test]
fn test_document_from_content_crlf_normalization() {
    let content = "fn main() {\r\n    println!(\"Hello\");\r\n}";
    let doc = Document::from_content(content, None);
    assert_eq!(doc.eol, EolStyle::CrLf);
    assert_eq!(doc.buffer.slice(0, doc.buffer.len_chars()), "fn main() {\n    println!(\"Hello\");\n}");
    assert_eq!(doc.to_disk_content(), content);
}

#[test]
fn test_document_apply_edit_and_undo_redo() {
    let mut doc = Document::from_content("hello world", None);
    let edit = TextEdit {
        range: EditRange {
            start: Position { line: 0, column: 5 },
            end: Position { line: 0, column: 11 },
        },
        new_text: " rust".to_string(),
    };

    let cursor_before = Some(Position { line: 0, column: 11 });
    let result = doc.apply_edit(&edit, cursor_before);

    assert_eq!(result.new_version, 1);
    assert_eq!(doc.version, 1);
    assert!(doc.is_dirty);
    assert!(doc.can_undo());
    assert_eq!(doc.buffer.slice(0, doc.buffer.len_chars()), "hello rust");

    // Check undo stack entry
    let (undo_edit, undo_pos) = doc.undo().unwrap();
    assert_eq!(undo_pos, Position { line: 0, column: 11 });
    assert_eq!(undo_edit.range.start, Position { line: 0, column: 5 });

    // Check redo stack entry
    let (redo_edit, _) = doc.redo().unwrap();
    assert_eq!(redo_edit.new_text, " rust");
}

#[test]
fn test_document_info_serialization() {
    let doc = Document::from_content("line 1\nline 2", Some(std::path::PathBuf::from("/test/file.rs")));
    let info = doc.info();
    assert_eq!(info.path, Some("/test/file.rs".to_string()));
    assert_eq!(info.version, 0);
    assert_eq!(info.line_count, 2);
    assert_eq!(info.char_count, 13);
    assert_eq!(info.eol, EolStyle::Lf);
    assert!(!info.is_dirty);
}

#[test]
fn test_document_registry_operations() {
    let registry = DocumentRegistry::new();
    assert_eq!(registry.len(), 0);

    let path = std::path::PathBuf::from("/test/app.rs");
    let doc1 = registry.open(path.clone(), "fn main() {}");
    assert_eq!(registry.len(), 1);

    // Reopening same path returns existing Arc
    let doc2 = registry.open(path.clone(), "different content");
    assert!(Arc::ptr_eq(&doc1, &doc2));

    // Get
    assert!(registry.get(&path).is_some());

    // Untitled opening
    let (name1, _untitled1) = registry.open_untitled();
    assert_eq!(name1, "Untitled-1");
    let (name2, _) = registry.open_untitled();
    assert_eq!(name2, "Untitled-2");
    assert_eq!(registry.len(), 3);

    // Close
    assert!(registry.close(&path));
    assert_eq!(registry.len(), 2);
    assert!(registry.get(&path).is_none());
}

#[test]
fn test_document_registry_concurrent_access() {
    let registry = Arc::new(DocumentRegistry::new());
    let mut handles = vec![];

    for i in 0..10 {
        let reg_clone = Arc::clone(&registry);
        handles.push(thread::spawn(move || {
            let path = std::path::PathBuf::from(format!("/tmp/file_{}.rs", i));
            let _ = reg_clone.open(path, "fn test() {}");
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    assert_eq!(registry.len(), 10);
}
