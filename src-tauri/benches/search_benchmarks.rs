use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pomai_studio_lib::commands::search_commands::{search_in_files, SearchOptions};
use tempfile::tempdir;
use std::fs;

fn bench_search_operations(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Generate 50 files with code content
    for i in 0..50 {
        let content = format!(
            "fn process_item_{}(val: usize) -> usize {{\n    let key = \"search_target_token\";\n    val + {}\n}}\n",
            i, i
        );
        fs::write(root.join(format!("file_{}.rs", i)), content).unwrap();
    }

    let mut group = c.benchmark_group("Search (Grep & Regex Engine)");

    // 1. Plain String Search across 50 files
    let plain_opts = SearchOptions {
        query: "search_target_token".to_string(),
        roots: vec![root.to_string_lossy().to_string()],
        is_case_sensitive: true,
        is_whole_word: false,
        is_regex: false,
        include_pattern: None,
        exclude_pattern: None,
        max_results: None,
    };

    group.bench_function("search_plain_text_50_files", |b| {
        b.to_async(&rt).iter(|| async {
            let _ = search_in_files(black_box(plain_opts.clone())).await;
        });
    });

    // 2. Regex Whole Word Search across 50 files
    let regex_opts = SearchOptions {
        query: r"process_item_\d+".to_string(),
        roots: vec![root.to_string_lossy().to_string()],
        is_case_sensitive: false,
        is_whole_word: false,
        is_regex: true,
        include_pattern: Some("*.rs".to_string()),
        exclude_pattern: None,
        max_results: None,
    };

    group.bench_function("search_regex_50_files", |b| {
        b.to_async(&rt).iter(|| async {
            let _ = search_in_files(black_box(regex_opts.clone())).await;
        });
    });

    group.finish();
}

criterion_group!(benches, bench_search_operations);
criterion_main!(benches);
