use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pomai_studio_lib::buffer::{RopeBuffer, TextBuffer, Position, EditRange, TextEdit, EditStack, EditResult};

fn bench_buffer_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Buffer (Ropey & EditStack)");

    // Sample documents
    let small_doc = "fn main() {\n    println!(\"Hello, world!\");\n}\n".repeat(25); // 100 lines
    let large_doc = "fn calculate_item(x: usize) -> usize {\n    let val = x * 42;\n    val + 10\n}\n".repeat(25_000); // 100,000 lines

    // 1. Single character insertion in 100-line buffer
    group.bench_function("insert_char_100_lines", |b| {
        b.iter(|| {
            let mut buf = RopeBuffer::from_str(black_box(&small_doc));
            let edit = TextEdit {
                range: EditRange::point(50, 10),
                new_text: "a".to_string(),
            };
            buf.apply_edit(black_box(&edit));
        });
    });

    // 2. Single character insertion in 100,000-line buffer (O(log N) verification)
    group.bench_function("insert_char_100k_lines", |b| {
        b.iter(|| {
            let mut buf = RopeBuffer::from_str(black_box(&large_doc));
            let edit = TextEdit {
                range: EditRange::point(50_000, 10),
                new_text: "x".to_string(),
            };
            buf.apply_edit(black_box(&edit));
        });
    });

    // 3. Multi-line range deletion in 100,000-line buffer
    group.bench_function("delete_range_100k_lines", |b| {
        b.iter(|| {
            let mut buf = RopeBuffer::from_str(black_box(&large_doc));
            let edit = TextEdit {
                range: EditRange {
                    start: Position { line: 10_000, column: 0 },
                    end: Position { line: 10_500, column: 0 },
                },
                new_text: String::new(),
            };
            buf.apply_edit(black_box(&edit));
        });
    });

    // 4. Line slice extraction (Viewport rendering simulation)
    let buf_large = RopeBuffer::from_str(&large_doc);
    group.bench_function("slice_50_lines_for_viewport", |b| {
        b.iter(|| {
            black_box(buf_large.slice(50_000, 50_050));
        });
    });

    // 5. EditStack push, undo, redo operations
    group.bench_function("edit_stack_push_undo_redo", |b| {
        b.iter(|| {
            let mut stack = EditStack::new();
            let edit = TextEdit {
                range: EditRange::point(1, 0),
                new_text: "let x = 1;".to_string(),
            };
            let res = EditResult {
                new_version: 1,
                affected_range: EditRange::point(1, 0),
                line_delta: 0,
            };
            stack.push_edit(edit, res, Some(Position { line: 1, column: 0 }));
            let _ = stack.pop_undo();
            let _ = stack.pop_redo();
        });
    });

    group.finish();
}

criterion_group!(benches, bench_buffer_operations);
criterion_main!(benches);
