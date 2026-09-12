use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pomai_studio_lib::syntax::{
    tokenizer::tokenize_line,
    rust_indentation::RustIndenter,
    parser::DocumentParser,
    types::TextEdit,
};

fn bench_syntax_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("Syntax (Tokenizer, Tree-sitter & Indenter)");

    // Sample Rust file content (1,000 lines)
    let rust_code = r#"
pub struct UserData {
    pub id: u64,
    pub name: String,
}

impl UserData {
    pub fn new(id: u64, name: &str) -> Self {
        Self {
            id,
            name: name.to_string(),
        }
    }

    pub fn process(&self) -> String {
        format!("{}: {}", self.id, self.name)
    }
}
"#.repeat(70); // ~1,000 lines

    // 1. Line tokenization (Naive Regex/Lexer)
    let sample_line = "const handleSave = (event: React.MouseEvent) => { console.log('Saved'); };";
    group.bench_function("tokenize_line_ts", |b| {
        b.iter(|| {
            black_box(tokenize_line(black_box(sample_line)));
        });
    });

    // 2. Tree-sitter Full Parse (1,000 lines of Rust code)
    group.bench_function("tree_sitter_full_parse_1k_lines", |b| {
        b.iter(|| {
            let mut dp = DocumentParser::new(tree_sitter_rust::LANGUAGE.into()).unwrap();
            dp.full_parse(black_box(&rust_code));
        });
    });

    // 3. Tree-sitter Incremental Reparse vs Full Parse
    let mut dp = DocumentParser::new(tree_sitter_rust::LANGUAGE.into()).unwrap();
    dp.full_parse(&rust_code);

    let edit = TextEdit {
        start_byte: 10,
        old_end_byte: 10,
        new_end_byte: 11,
        start_position: [1, 0],
        old_end_position: [1, 0],
        new_end_position: [1, 1],
    };
    let modified_code = format!(" // edit\n{}", rust_code);

    group.bench_function("tree_sitter_incremental_reparse", |b| {
        b.iter(|| {
            dp.apply_edit_and_reparse(black_box(&edit), black_box(&modified_code));
        });
    });

    // 4. Rust Smart Indentation Calculation
    let indenter = RustIndenter::new(4);
    group.bench_function("rust_indentation_calculation", |b| {
        b.iter(|| {
            black_box(indenter.get_indent_for_new_line(black_box("fn calculate() {"), 0));
        });
    });

    group.finish();
}

criterion_group!(benches, bench_syntax_operations);
criterion_main!(benches);
