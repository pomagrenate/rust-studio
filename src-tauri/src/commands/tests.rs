/**
 * commands/tests.rs — Comprehensive integration tests for Tauri editor commands
 */

#[cfg(test)]
mod command_integration_tests {
    use std::fs;
    use tempfile::tempdir;
    use crate::commands::fs_commands::{
        create_file, read_file, save_file, list_dir, delete_path, create_rust_file
    };
    use crate::commands::search_commands::{
        search_in_files, replace_in_files, SearchOptions, FileReplacement
    };
    use crate::commands::workspaces::{save_workspace_as, PomaiWorkspace};

    #[tokio::test]
    async fn test_full_editor_file_lifecycle() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let src_file = root.join("src/main.rs").to_string_lossy().to_string();

        // 1. Create file with parent directory auto-creation
        create_file(src_file.clone()).await.expect("Failed to create file");
        assert!(root.join("src/main.rs").exists());

        // 2. Save Rust content
        let initial_code = "fn main() {\n    let count = 100;\n    println!(\"Count: {}\", count);\n}";
        save_file(src_file.clone(), initial_code.to_string()).await.expect("Failed to save file");

        // 3. Read back content
        let read_content = read_file(src_file.clone()).await.expect("Failed to read file");
        assert_eq!(read_content, initial_code);

        // 4. Search in files for "count"
        let opts = SearchOptions {
            query: "count".to_string(),
            roots: vec![root.to_string_lossy().to_string()],
            is_case_sensitive: true,
            is_whole_word: true,
            is_regex: false,
            include_pattern: None,
            exclude_pattern: None,
            max_results: None,
        };

        let search_res = search_in_files(opts).await.expect("Search failed");
        assert_eq!(search_res.total_files, 1);
        assert_eq!(search_res.total_matches, 2);

        // 5. Replace "count" -> "total_count"
        let replacements = vec![
            FileReplacement {
                file_path: src_file.clone(),
                line_number: 2,
                match_start: 8,
                match_end: 13,
                replacement: "total_count".to_string(),
            },
            FileReplacement {
                file_path: src_file.clone(),
                line_number: 3,
                match_start: 26,
                match_end: 31,
                replacement: "total_count".to_string(),
            },
        ];

        let replaced_num = replace_in_files(replacements).await.expect("Replace failed");
        assert_eq!(replaced_num, 2);

        // 6. Verify replaced file content
        let updated_code = read_file(src_file.clone()).await.unwrap();
        assert_eq!(updated_code, "fn main() {\n    let total_count = 100;\n    println!(\"Count: {}\", total_count);\n}");

        // 7. Cleanup
        delete_path(src_file).await.expect("Failed to delete file");
    }

    #[tokio::test]
    async fn test_workspace_project_structuring() {
        let dir = tempdir().unwrap();
        let project_root = dir.path().join("my_project");

        // Create Rust file in new module
        let lib_path = project_root.join("src/lib.rs").to_string_lossy().to_string();
        create_rust_file(lib_path.clone()).await.unwrap();

        // Verify boilerplate content
        let content = read_file(lib_path).await.unwrap();
        assert!(content.contains("pub fn init()"));

        // List directory entries
        let entries = list_dir(project_root.join("src").to_string_lossy().to_string()).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "lib.rs");

        // Save workspace file
        let ws_file = project_root.join("project.code-workspace").to_string_lossy().to_string();
        save_workspace_as(ws_file.clone(), vec![project_root.to_string_lossy().to_string()]).unwrap();

        let ws_raw = fs::read_to_string(&ws_file).unwrap();
        let parsed_ws: PomaiWorkspace = serde_json::from_str(&ws_raw).unwrap();
        assert_eq!(parsed_ws.folders.len(), 1);
    }
}
