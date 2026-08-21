//! syntax/tests.rs — Unit and integration tests for syntax, tokenization, tree-sitter parser, and indenter.

use super::*;
use super::rust_comments::RustCommenter;
use super::rust_indentation::RustIndenter;
use super::metadata::{TokenMetadata, TokenKind};

#[test]
fn test_token_metadata_pack_unpack() {
    let packed = TokenMetadata::pack_simple(TokenKind::Keyword);
    let unpacked = TokenMetadata::unpack_kind(packed);
    assert_eq!(unpacked, TokenKind::Keyword);
}

#[test]
fn test_tokenize_line_keywords_and_comments() {
    let line = "let x = 10;";
    let tokens = tokenize_line(line);
    assert!(!tokens.is_empty());

    let comment_line = "// this is a comment";
    let comment_tokens = tokenize_line(comment_line);
    assert_eq!(comment_tokens[0], 0);
    assert_eq!(TokenMetadata::unpack_kind(comment_tokens[1]), TokenKind::Comment);
}

#[test]
fn test_rust_commenter_operations() {
    // Line comment
    assert_eq!(RustCommenter::toggle_line_comment("let a = 1;"), "// let a = 1;");
    assert_eq!(RustCommenter::toggle_line_comment("// let a = 1;"), "let a = 1;");
    assert_eq!(RustCommenter::toggle_line_comment("    let b = 2;"), "    // let b = 2;");

    // Block comment
    let lines = vec!["fn test() {}".to_string()];
    let toggled = RustCommenter::toggle_block_comment(&lines, 0, 0);
    assert_eq!(toggled[0], "/* fn test() {} */");

    let untoggled = RustCommenter::toggle_block_comment(&toggled, 0, 0);
    assert_eq!(untoggled[0], "fn test() {}");

    // Comment detection
    assert!(RustCommenter::is_comment("// comment"));
    assert_eq!(RustCommenter::get_comment_type("// comment"), Some("line"));
}

#[test]
fn test_rust_indenter_new_line_calculation() {
    let indenter = RustIndenter::new(4);
    assert_eq!(indenter.get_indent_for_new_line("fn main() {", 0), "    ");
    assert_eq!(indenter.get_indent_for_new_line("struct App {", 0), "    ");
    assert_eq!(indenter.get_indent_for_line("}", "    let x = 1;", 4), "");
}

#[test]
fn test_syntax_engine_tree_sitter_lifecycle() {
    let engine = SyntaxEngine::new();
    let doc_id = "doc1";
    let source = "fn main() { let x = 42; }";

    // Open & parse
    engine.open_document(doc_id, "main.rs", source);
    let parser_ref = engine.get(doc_id);
    assert!(parser_ref.is_some());

    {
        let dp = parser_ref.unwrap();
        let guard = dp.lock();
        assert!(!guard.has_errors());
        assert!(guard.root_node().is_some());
    }

    // Close
    engine.close_document(doc_id);
    assert!(engine.get(doc_id).is_none());
}
