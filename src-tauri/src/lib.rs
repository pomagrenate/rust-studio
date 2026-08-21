// pomai-studio Rust core — lib.rs
// Entry point: registers all Tauri commands and builds the app.

pub mod buffer;
pub mod document;
pub mod fs;
pub mod viewport;
pub mod commands;
pub mod syntax;
pub mod debugger;
pub mod linter;
pub mod lsp;
pub mod cargo;
pub mod github;
pub mod codewiki;
pub mod backup;
pub mod settings;

use commands::{buffer_commands, fs_commands, viewport_commands, terminal_commands, search_commands, timeline_commands, git_commands, cargo_commands, syntax_commands, lsp_commands, clippy_commands, codewiki_commands, backup_commands, settings_commands};
use github::{api, auth};
use debugger::{DebuggerState, debugger_embed::EmbeddedDebugger, start_debug_session, send_dap_request, stop_debug_session};
use linter::scan_workspace_linter;
use std::sync::Arc;
use parking_lot::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let syntax_state = Arc::new(commands::syntax_commands::SyntaxState::new().unwrap_or_else(|e| {
        eprintln!("[Syntax Engine Warning] Failed to initialize: {}", e);
        // Better error handling could be here, but unwrap/panic might be okay for dev.
        // We'll panic for now if syntax can't start because it's a core feature.
        panic!("Syntax Engine Initialization Failed: {}", e);
    }));
    let debugger_engine = EmbeddedDebugger::init().unwrap_or_else(|e| {
        eprintln!("[Debugger Init Warning] {}", e);
        EmbeddedDebugger::init().unwrap()
    });

    let debugger_state = Arc::new(DebuggerState {
        engine: debugger_engine,
        active_session: Arc::new(Mutex::new(None)),
    });

    let code_wiki_state: crate::codewiki::graph::CodeGraphState = Arc::new(parking_lot::RwLock::new(crate::codewiki::graph::CodeGraph::new()));

    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(terminal_commands::TerminalState {
            sessions: std::collections::HashMap::new(),
        })))
        .manage(debugger_state)
        .manage(syntax_state)
        .manage(lsp_commands::LspState::new())
        .manage(Arc::new(cargo_commands::CargoProcessState::new()))
        .manage(code_wiki_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // File System commands
            fs_commands::list_dir,
            fs_commands::open_file,
            fs_commands::save_file,
            fs_commands::create_file,
            fs_commands::create_dir,
            fs_commands::delete_path,
            fs_commands::rename_path,
            fs_commands::copy_path,
            fs_commands::move_path,
            fs_commands::read_file,
            fs_commands::create_rust_file,
            fs_commands::create_rust_module,
            fs_commands::create_cargo_crate,
            fs_commands::create_scratch_file,

            // Buffer / document commands
            buffer_commands::open_document,
            buffer_commands::close_document,
            buffer_commands::apply_edit,
            buffer_commands::get_line_range,
            buffer_commands::get_document_info,
            buffer_commands::get_line_count,
            buffer_commands::undo_edit,
            buffer_commands::redo_edit,
            buffer_commands::can_undo,
            buffer_commands::can_redo,
            buffer_commands::tokenize_lines,
            buffer_commands::format_rust_file,

            // Syntax Tree-sitter commands
            syntax_commands::syntax_open_document,
            syntax_commands::syntax_update_document,
            syntax_commands::syntax_close_document,
            syntax_commands::syntax_highlight,

            // LSP / rust-analyzer commands
            lsp_commands::lsp_start,
            lsp_commands::lsp_stop,
            lsp_commands::lsp_open_document,
            lsp_commands::lsp_sync_document,
            lsp_commands::lsp_close_document,
            lsp_commands::lsp_get_status,
            lsp_commands::lsp_hover,
            lsp_commands::lsp_goto_definition,
            lsp_commands::lsp_goto_implementation,
            lsp_commands::lsp_check_rust_src,
            lsp_commands::lsp_install_rust_src,
            lsp_commands::lsp_completion,
            lsp_commands::lsp_code_action,

            // Viewport commands
            viewport_commands::get_viewport_data,
            viewport_commands::set_viewport_scroll,
            
            // Window commands
            commands::window_commands::spawn_new_window,
            commands::window_commands::duplicate_workspace_window,

            // Workspace / Recent commands
            commands::workspaces::get_recently_opened,
            commands::workspaces::add_recently_opened,
            commands::workspaces::remove_recently_opened,
            commands::workspaces::clear_recently_opened,
            commands::workspaces::save_workspace_as,

            // Search commands
            search_commands::search_in_files,
            search_commands::replace_in_files,
            search_commands::get_call_hierarchy,
            search_commands::get_type_hierarchy,

            // Terminal commands
            terminal_commands::list_terminal_profiles,
            terminal_commands::spawn_terminal,
            terminal_commands::create_terminal,
            terminal_commands::write_terminal,
            terminal_commands::resize_terminal,
            terminal_commands::kill_terminal,

            // Timeline commands
            timeline_commands::get_file_timeline,

            // Source Control (Git) commands
            git_commands::git_status,
            git_commands::git_get_graph,
            git_commands::git_stage_file,
            git_commands::git_unstage_file,
            git_commands::git_stage_all,
            git_commands::git_unstage_all,
            git_commands::git_discard_file,
            git_commands::git_discard_all,
            git_commands::git_commit,
            git_commands::git_push,
            git_commands::git_pull,
            git_commands::git_fetch,
            git_commands::git_init,
            git_commands::git_get_branches,
            git_commands::git_checkout,
            git_commands::git_create_branch,
            git_commands::git_get_conflicts,
            git_commands::git_resolve_conflict_file,

            // Rust IDE (Cargo) commands
            cargo_commands::cargo_get_project_info,
            cargo_commands::cargo_check_diagnostics,
            cargo_commands::cargo_check_workspace_diagnostics,
            cargo_commands::cargo_run_command,
            cargo_commands::cargo_test_discovery,
            cargo_commands::cargo_format,
            cargo_commands::cargo_create_project,
            cargo_commands::cargo_scaffold_project,
            cargo_commands::cargo_run_single_test,
            cargo_commands::cargo_check_streaming,
            cargo_commands::cargo_clippy_streaming,
            cargo_commands::cargo_build_streaming,
            cargo_commands::cargo_cancel_build,
            cargo_commands::cargo_get_active_process,
            cargo_commands::cargo_get_external_libraries,
            cargo_commands::cargo_apply_suggestion,

            // Clippy commands
            clippy_commands::run_clippy_diagnostics,
            clippy_commands::apply_clippy_fix,
            clippy_commands::apply_single_clippy_fix,

            // CodeLLDB Embedded Debugger commands
            start_debug_session,
            send_dap_request,
            stop_debug_session,

            // Pomai Linter commands
            scan_workspace_linter,

            // GitHub API commands
            api::github_list_prs,
            api::github_create_pr,
            api::github_list_issues,
            api::github_create_issue,
            api::github_get_repo_info,
            api::github_list_user_repos,

            // GitHub Authentication commands
            auth::store_github_token,
            auth::get_github_token,
            auth::clear_github_token,
            auth::validate_token_format,

            // CodeWiki commands
            codewiki_commands::build_code_wiki_index,
            codewiki_commands::get_code_wiki_page,
            codewiki_commands::get_code_wiki_graph,
            codewiki_commands::search_code_wiki_symbols,
            codewiki_commands::get_code_wiki_blast_radius,

            // Local Code Backup commands
            backup_commands::create_code_backup,
            backup_commands::list_code_backups,
            backup_commands::restore_code_backup,
            backup_commands::delete_code_backup,

            // IDE Settings commands
            settings_commands::get_user_settings,
            settings_commands::save_user_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
