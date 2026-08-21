//! linter/tests.rs — Unit tests for Pomai Linter module.

use super::*;
use tempfile::tempdir;
use std::fs;

#[test]
fn test_in_process_linter_scan_detects_findings() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Create a mock Rust file with issues
    let rs_content = r#"
fn calculate() {
    let val = Some(42).unwrap();
    unsafe {
        // memory operation
    }
    // TODO: refactor this function
}
"#;

    let file_path = root.join("main.rs");
    fs::write(&file_path, rs_content).unwrap();

    let report = run_in_process_scan(root);

    assert!(report.success);
    assert_eq!(report.scanned_files_count, 1);
    assert_eq!(report.findings.len(), 3);

    let check_ids: Vec<&str> = report.findings.iter().map(|f| f.check_id.as_str()).collect();
    assert!(check_ids.contains(&"pomai.rust.safety.avoid-unwrap"));
    assert!(check_ids.contains(&"pomai.rust.safety.unsafe-block-audit"));
    assert!(check_ids.contains(&"pomai.quality.pending-todo"));
}

#[test]
fn test_get_target_triple_non_empty() {
    let triple = get_target_triple();
    assert!(!triple.is_empty());
    assert!(triple.contains("x86_64") || triple.contains("aarch64"));
}
