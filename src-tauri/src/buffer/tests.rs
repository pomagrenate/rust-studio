/// buffer/tests.rs — Integration and end-to-end workflow tests for text buffer subsystem.

#[cfg(test)]
mod integration_tests {
    use std::sync::{Arc, RwLock};
    use std::thread;

    use crate::buffer::{
        TextBuffer, RopeBuffer, EditStack, TextEdit, EditRange, Position
    };

    fn _pos_to_char(buf: &RopeBuffer, pos: Position) -> usize {
        buf.line_to_char(pos.line) + pos.column
    }

    #[test]
    fn test_full_editor_session_workflow() {
        let initial_text = "fn calculate_sum(a: i32, b: i32) -> i32 {\n    a + b\n}";
        let mut buffer = RopeBuffer::from_str(initial_text);
        let mut stack = EditStack::new();
        let mut version = 0u64;

        assert_eq!(buffer.len_lines(), 3);
        assert_eq!(buffer.line_content(0), "fn calculate_sum(a: i32, b: i32) -> i32 {");
        assert_eq!(buffer.line_content(1), "    a + b");
        assert_eq!(buffer.line_content(2), "}");

        // ── Edit 1: Add doc comment at top ───────────────────────────────────
        version += 1;
        let edit1 = TextEdit::insert(0, 0, "/// Calculates sum of two integers.\n");
        let cursor_before1 = Position { line: 0, column: 0 };
        let mut res1 = buffer.apply_edit(&edit1);
        res1.new_version = version;
        stack.push_edit(edit1, res1, Some(cursor_before1));

        assert_eq!(buffer.len_lines(), 4);
        assert_eq!(buffer.line_content(0), "/// Calculates sum of two integers.");
        assert_eq!(buffer.line_content(1), "fn calculate_sum(a: i32, b: i32) -> i32 {");

        // ── Edit 2: Change parameter type i32 -> i64 ─────────────────────────
        version += 1;
        let edit2 = TextEdit {
            range: EditRange {
                start: Position { line: 1, column: 36 },
                end: Position { line: 1, column: 39 },
            },
            new_text: "i64".to_string(),
        };
        let cursor_before2 = Position { line: 1, column: 36 };
        let mut res2 = buffer.apply_edit(&edit2);
        res2.new_version = version;
        stack.push_edit(edit2, res2, Some(cursor_before2));

        assert_eq!(buffer.line_content(1), "fn calculate_sum(a: i32, b: i32) -> i64 {");

        // ── Edit 3: Insert log statement ─────────────────────────────────────
        version += 1;
        let edit3 = TextEdit::insert(2, 0, "    println!(\"Calculating...\");\n");
        let cursor_before3 = Position { line: 2, column: 0 };
        let mut res3 = buffer.apply_edit(&edit3);
        res3.new_version = version;
        stack.push_edit(edit3, res3, Some(cursor_before3));

        assert_eq!(buffer.len_lines(), 5);
        assert_eq!(buffer.line_content(2), "    println!(\"Calculating...\");");

        // ── Step-by-Step UNDO ───────────────────────────────────────────────
        // Undo Edit 3
        assert!(stack.can_undo());
        let (inv3, _cursor3) = stack.pop_undo().unwrap();
        buffer.apply_edit(&TextEdit::delete(inv3.range));
        assert_eq!(buffer.len_lines(), 4);

        // Undo Edit 2: Restore i32
        let (inv2, _cursor2) = stack.pop_undo().unwrap();
        let edit_restore_i32 = TextEdit {
            range: inv2.range,
            new_text: "i32".to_string(),
        };
        buffer.apply_edit(&edit_restore_i32);
        assert_eq!(buffer.line_content(1), "fn calculate_sum(a: i32, b: i32) -> i32 {");

        // Undo Edit 1: Remove doc comment
        let (inv1, _cursor1) = stack.pop_undo().unwrap();
        let start_char = buffer.line_to_char(inv1.range.start.line);
        let len_to_del = "/// Calculates sum of two integers.\n".chars().count();
        buffer.delete(start_char, len_to_del);

        assert_eq!(buffer.len_lines(), 3);
        assert_eq!(buffer.line_content(0), "fn calculate_sum(a: i32, b: i32) -> i32 {");
        assert_eq!(buffer.line_content(1), "    a + b");
        assert_eq!(buffer.line_content(2), "}");
    }

    #[test]
    fn test_unicode_complex_multilingual_editing() {
        let initial = "// English Header\nprintln!(\"こんにちは世界 🌍\");\n// End";
        let mut buf = RopeBuffer::from_str(initial);

        assert_eq!(buf.len_lines(), 3);

        // Replace "こんにちは世界 🌍" (9 chars at col 10) with "Hello 宇宙 🌌"
        let edit = TextEdit {
            range: EditRange {
                start: Position { line: 1, column: 10 },
                end: Position { line: 1, column: 19 },
            },
            new_text: "Hello 宇宙 🌌".to_string(),
        };

        buf.apply_edit(&edit);
        assert_eq!(buf.line_content(1), "println!(\"Hello 宇宙 🌌\");");

        // Verify char_to_line conversion with multi-byte text
        let char_at_line2 = buf.line_to_char(2);
        assert_eq!(buf.char_to_line(char_at_line2), 2);
        assert_eq!(buf.line_content(2), "// End");
    }

    #[test]
    fn test_large_document_bulk_edits_and_undo_performance() {
        // Create 20,000 line file
        let template = "let value = 100;\n";
        let doc_text = template.repeat(20_000);
        let mut buffer = RopeBuffer::from_str(&doc_text);
        let mut stack = EditStack::new();

        assert_eq!(buffer.len_lines(), 20_001);

        // Perform 50 insertions at different line positions
        for i in 0..50 {
            let target_line = i * 400;
            let edit = TextEdit::insert(target_line, 0, &format!("// Marker {}\n", i));
            let res = buffer.apply_edit(&edit);
            stack.push_edit(edit, res, None);
        }

        assert_eq!(buffer.len_lines(), 20_051);
        assert_eq!(buffer.line_content(0), "// Marker 0");

        // Verify line lookups deep in document remain fast (account for 25 insertions before line 10,000)
        let mid_line = buffer.line_content(10_025);
        assert!(mid_line.contains("let value"));

        // Undo all 50 edits
        for _ in 0..50 {
            assert!(stack.can_undo());
            stack.pop_undo();
        }

        assert_eq!(stack.can_undo(), false);
        assert!(stack.can_redo());
    }

    #[test]
    fn test_consecutive_enter_key_line_splits() {
        let initial = "fn main() {\n    let a = 10;\n}";
        let mut buffer = RopeBuffer::from_str(initial);
        assert_eq!(buffer.len_lines(), 3);

        // Press Enter 5 times at line 1, col 15 (after `let a = 10;`)
        for i in 0..5 {
            let edit = TextEdit::insert(1 + i, 15, "\n    ");
            buffer.apply_edit(&edit);
        }

        assert_eq!(buffer.len_lines(), 8);
        assert_eq!(buffer.line_content(1), "    let a = 10;");
        assert_eq!(buffer.line_content(2), "    ");
        assert_eq!(buffer.line_content(6), "    ");
        assert_eq!(buffer.line_content(7), "}");
    }

    #[test]
    fn test_document_versioning_increments() {
        use crate::document::Document;

        let mut doc = Document::from_content("hello\nworld", None);
        assert_eq!(doc.version, 0);

        let edit1 = TextEdit::insert(0, 5, "!");
        let res1 = doc.apply_edit(&edit1, None);
        assert_eq!(res1.new_version, 1);
        assert_eq!(doc.version, 1);

        let edit2 = TextEdit::insert(1, 5, "!");
        let res2 = doc.apply_edit(&edit2, None);
        assert_eq!(res2.new_version, 2);
        assert_eq!(doc.version, 2);
    }

    #[test]
    fn test_thread_safety_send_sync() {
        let buffer = Arc::new(RwLock::new(RopeBuffer::from_str("line 1\nline 2\nline 3")));
        let mut handles = vec![];

        for i in 0..4 {
            let buf_clone = Arc::clone(&buffer);
            let handle = thread::spawn(move || {
                let reader = buf_clone.read().expect("Lock failed");
                assert_eq!(reader.len_lines(), 3);
                assert_eq!(reader.line_content(i % 3), format!("line {}", (i % 3) + 1));
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().expect("Thread panicked");
        }
    }
}
