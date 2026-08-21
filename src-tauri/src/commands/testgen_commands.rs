use crate::rust_testgen::{
    generate_rust_test_suite, parse_rust_file_ast, RustGeneratedTestSuite, RustTestOptions,
};
use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub async fn generate_rust_tests(
    file_path: String,
    options: Option<RustTestOptions>,
) -> Result<RustGeneratedTestSuite, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Source file does not exist: {}", file_path));
    }

    let code = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.clone());

    let funcs = parse_rust_file_ast(&code)?;
    let opts = options.unwrap_or_default();

    let suite = generate_rust_test_suite(&file_name, &funcs, &opts);
    Ok(suite)
}

#[command]
pub async fn inject_rust_tests_to_file(
    file_path: String,
    test_code: String,
) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Target file does not exist: {}", file_path));
    }

    let mut existing_code = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

    // Check if `mod tests` already exists
    if existing_code.contains("mod tests") {
        return Err("File already contains a `mod tests` block. Please review or paste manually.".to_string());
    }

    if !existing_code.ends_with('\n') {
        existing_code.push('\n');
    }
    existing_code.push('\n');
    existing_code.push_str(&test_code);

    fs::write(path, existing_code)
        .map_err(|e| format!("Failed to write tests to file {}: {}", file_path, e))?;

    Ok(())
}
