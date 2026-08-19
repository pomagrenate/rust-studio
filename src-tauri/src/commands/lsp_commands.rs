/// commands/lsp_commands.rs — Tauri IPC bridge for the LSP/RA subsystem.
///
/// Tauri-managed state: `Arc<LspState>` which bundles:
///   - The `LspHost` handle (for sending requests)
///   - The `CacheEngine` (for document buffers)
///
/// Commands exposed:
///   lsp_start              — Spawn rust-analyzer for a workspace
///   lsp_stop               — Gracefully shutdown
///   lsp_open_document      — textDocument/didOpen
///   lsp_sync_document      — textDocument/didChange (incremental + debounce)
///   lsp_close_document     — textDocument/didClose
///   lsp_get_status         — Poll current LspStatus
///   lsp_hover              — textDocument/hover → HoverResult
///   lsp_goto_definition    — textDocument/definition → GotoDefinitionResult
///   lsp_completion         — textDocument/completion → Vec<CompletionItem>

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::json;
use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use crate::lsp::{
    cache_engine::CacheEngine,
    definition_resolver::DefinitionResolver,
    diagnostic_manager::DiagnosticManager,
    lsp_host::LspHost,
    types::{
        CodeAction, CompletionItem, DocumentSyncPayload, HoverResult,
        LspCapabilities, LspPosition, LspRange, LspStatus, LocationLink, ResolvedDefinition, RustSrcStatus,
    },
};

// ── Managed State ─────────────────────────────────────────────────────────

/// App-level managed state. Access via `State<'_, Arc<LspState>>`.
pub struct LspState {
    /// None until `lsp_start` is called.
    pub host: Mutex<Option<LspHost>>,
    pub cache: Arc<CacheEngine>,
    pub cancel: Mutex<Option<CancellationToken>>,
    /// Definition resolver for workspace/stdlib/external file resolution
    pub definition_resolver: Mutex<Option<DefinitionResolver>>,
}

impl LspState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            host: Mutex::new(None),
            cache: CacheEngine::new(),
            cancel: Mutex::new(None),
            definition_resolver: Mutex::new(None),
        })
    }
}

// ── Helper macros ─────────────────────────────────────────────────────────

macro_rules! require_host {
    ($state:expr) => {
        match $state.host.lock().as_ref().cloned() {
            Some(h) => h,
            None => return Err("LSP host not started. Call lsp_start first.".into()),
        }
    };
}

// ── Commands ──────────────────────────────────────────────────────────────

/// Start rust-analyzer for the given workspace root.
/// Idempotent — calling this a second time stops the old server first.
#[tauri::command]
pub async fn lsp_start(
    app: AppHandle,
    workspace_root: String,
    state: State<'_, Arc<LspState>>,
) -> Result<LspCapabilities, String> {
    // Stop any running server first — extract BEFORE awaiting so the MutexGuard is dropped
    let old_host = state.host.lock().take();
    if let Some(old) = old_host {
        old.shutdown().await;
    }

    let root = PathBuf::from(&workspace_root);

    // Locate rust-analyzer binary in PATH
    let ra_bin = which_ra().ok_or("rust-analyzer not found in PATH")?;

    let cancel = CancellationToken::new();
    *state.cancel.lock() = Some(cancel.clone());

    let (host, server_rx) = LspHost::spawn(ra_bin, root.clone())
        .await
        .map_err(|e| format!("Failed to start LSP: {e}"))?;

    let caps = host.capabilities();

    // Initialize definition resolver
    let resolver = DefinitionResolver::new(root.clone())
        .map_err(|e| format!("Failed to initialize definition resolver: {e}"))?;

    // Spawn diagnostic manager to consume server messages
    DiagnosticManager::spawn(app, Arc::clone(&state.cache), server_rx, cancel);

    *state.host.lock() = Some(host);
    *state.definition_resolver.lock() = Some(resolver);
    Ok(caps)
}

/// Stop the running rust-analyzer process.
#[tauri::command]
pub async fn lsp_stop(state: State<'_, Arc<LspState>>) -> Result<(), String> {
    // Extract before awaiting — MutexGuard must not be held across await
    let host = state.host.lock().take();
    if let Some(h) = host {
        h.shutdown().await;
    }
    let cancel = state.cancel.lock().take();
    if let Some(c) = cancel {
        c.cancel();
    }
    Ok(())
}

/// Called when a file is opened. Sends `textDocument/didOpen` to RA.
#[tauri::command]
pub async fn lsp_open_document(
    uri: String,
    language_id: String,
    version: u32,
    text: String,
    state: State<'_, Arc<LspState>>,
) -> Result<(), String> {
    state.cache.open_document(&uri, &language_id, version, &text);

    let host = require_host!(state);
    host.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": uri,
                "languageId": language_id,
                "version": version,
                "text": text,
            }
        }),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Called on every keystroke. Applies incremental edits to the cache and
/// forwards a `textDocument/didChange` notification to RA.
/// Debounced re-analysis is handled by the DiagnosticManager background task.
#[tauri::command]
pub async fn lsp_sync_document(
    payload: DocumentSyncPayload,
    state: State<'_, Arc<LspState>>,
) -> Result<(), String> {
    // 1. Update our local rope buffer
    for change in &payload.changes {
        let version_advanced = state.cache.apply_incremental_update(
            &payload.uri,
            payload.version,
            change.range,
            &change.text,
        );
        if !version_advanced {
            // Version didn't advance — fall back to full sync if provided
            if let Some(ref full) = payload.full_text {
                state.cache.apply_full_update(&payload.uri, payload.version, full);
            }
        }
    }

    // 2. Mark document as needing analysis (debounce starts here)
    state.cache.mark_analysis_pending(&payload.uri);

    // 3. Forward didChange to RA (RA maintains its own mirror of the buffer)
    let host = require_host!(state);
    let content_changes: Vec<serde_json::Value> = payload
        .changes
        .iter()
        .map(|c| {
            if let Some(r) = c.range {
                json!({
                    "range": {
                        "start": { "line": r.start.line, "character": r.start.character },
                        "end":   { "line": r.end.line,   "character": r.end.character   },
                    },
                    "text": c.text
                })
            } else {
                json!({ "text": c.text })
            }
        })
        .collect();

    host.notify(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": payload.uri, "version": payload.version },
            "contentChanges": content_changes,
        }),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Called when a tab is closed.
#[tauri::command]
pub async fn lsp_close_document(
    uri: String,
    state: State<'_, Arc<LspState>>,
) -> Result<(), String> {
    state.cache.close_document(&uri);
    let host = require_host!(state);
    host.notify(
        "textDocument/didClose",
        json!({ "textDocument": { "uri": uri } }),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Returns the current LspStatus (Starting / Ready / Indexing / Error / Stopped).
#[tauri::command]
pub fn lsp_get_status(state: State<'_, Arc<LspState>>) -> LspStatus {
    state
        .host
        .lock()
        .as_ref()
        .map(|h| h.status.lock().clone())
        .unwrap_or(LspStatus::Stopped)
}

/// Request hover documentation at a source position.
#[tauri::command]
pub async fn lsp_hover(
    uri: String,
    line: u32,
    character: u32,
    state: State<'_, Arc<LspState>>,
) -> Result<Option<HoverResult>, String> {
    let host = require_host!(state);
    let result = host
        .request(
            "textDocument/hover",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character },
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    if result.is_null() {
        return Ok(None);
    }

    let content = extract_hover_content(&result);
    let range = result
        .get("range")
        .and_then(parse_lsp_range)
        .unwrap_or_default();

    Ok(Some(HoverResult { uri, range, content }))
}

/// Request goto definition at a source position (enhanced with virtual file support).
#[tauri::command]
pub async fn lsp_goto_definition(
    uri: String,
    line: u32,
    character: u32,
    state: State<'_, Arc<LspState>>,
) -> Result<Option<ResolvedDefinition>, String> {
    let host = require_host!(state);
    let resolver = state.definition_resolver.lock()
        .as_ref()
        .cloned()
        .ok_or("Definition resolver not initialized")?;

    let result = host
        .goto_definition(&uri, line, character)
        .await
        .map_err(|e| e.to_string())?;

    // Result may be Location[] or LocationLink[]
    let loc_link = if let Some(arr) = result.as_array() {
        arr.first().and_then(|l| parse_location_link(l))
    } else {
        parse_location_link(&result)
    };

    if let Some(link) = loc_link {
        let resolved = resolver.resolve_definition(link).await
            .map_err(|e| format!("Failed to resolve definition: {e}"))?;
        Ok(Some(resolved))
    } else {
        Ok(None)
    }
}

/// Request goto implementation at a source position (for trait implementations).
#[tauri::command]
pub async fn lsp_goto_implementation(
    uri: String,
    line: u32,
    character: u32,
    state: State<'_, Arc<LspState>>,
) -> Result<Option<ResolvedDefinition>, String> {
    let host = require_host!(state);
    let resolver = state.definition_resolver.lock()
        .as_ref()
        .cloned()
        .ok_or("Definition resolver not initialized")?;

    let result = host
        .goto_implementation(&uri, line, character)
        .await
        .map_err(|e| e.to_string())?;

    // Result may be Location[] or LocationLink[]
    let loc_link = if let Some(arr) = result.as_array() {
        arr.first().and_then(|l| parse_location_link(l))
    } else {
        parse_location_link(&result)
    };

    if let Some(link) = loc_link {
        let resolved = resolver.resolve_definition(link).await
            .map_err(|e| format!("Failed to resolve implementation: {e}"))?;
        Ok(Some(resolved))
    } else {
        Ok(None)
    }
}

/// Check rust-src installation status.
#[tauri::command]
pub async fn lsp_check_rust_src(state: State<'_, Arc<LspState>>) -> Result<RustSrcStatus, String> {
    let resolver = state.definition_resolver.lock()
        .as_ref()
        .cloned()
        .ok_or("Definition resolver not initialized")?;
    
    Ok(resolver.get_rust_src_status())
}

/// Install rust-src component.
#[tauri::command]
pub async fn lsp_install_rust_src(state: State<'_, Arc<LspState>>) -> Result<String, String> {
    let resolver = state.definition_resolver.lock()
        .as_ref()
        .cloned()
        .ok_or("Definition resolver not initialized")?;
    
    resolver.install_rust_src().await
        .map_err(|e| e.to_string())
}

/// Request completion items at a source position.
#[tauri::command]
pub async fn lsp_completion(
    uri: String,
    line: u32,
    character: u32,
    state: State<'_, Arc<LspState>>,
) -> Result<Vec<CompletionItem>, String> {
    let host = require_host!(state);
    let result = host
        .request(
            "textDocument/completion",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character },
                "context": { "triggerKind": 1 },
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    // Result may be CompletionList or CompletionItem[]
    let items = if let Some(list) = result.get("items").and_then(|v| v.as_array()) {
        list.iter().filter_map(parse_completion_item).collect()
    } else if let Some(arr) = result.as_array() {
        arr.iter().filter_map(parse_completion_item).collect()
    } else {
        vec![]
    };

    Ok(items)
}

/// Request code actions at a source position.
#[tauri::command]
pub async fn lsp_code_action(
    uri: String,
    line: u32,
    character: u32,
    state: State<'_, Arc<LspState>>,
) -> Result<Vec<CodeAction>, String> {
    let host = require_host!(state);
    host.code_actions(&uri, line, character)
        .await
        .map_err(|e| e.to_string())
}

// ── Parsing helpers ───────────────────────────────────────────────────────

fn parse_location_link(v: &serde_json::Value) -> Option<LocationLink> {
    Some(LocationLink {
        target_uri: v.get("uri")?.as_str()?.to_string(),
        target_range: v.get("range").and_then(parse_lsp_range)?,
        target_selection_range: v.get("targetSelectionRange")
            .and_then(parse_lsp_range)
            .unwrap_or_else(|| v.get("range").and_then(parse_lsp_range).unwrap_or_default()),
        origin_selection_range: v.get("originSelectionRange").and_then(parse_lsp_range),
    })
}

fn parse_lsp_range(v: &serde_json::Value) -> Option<LspRange> {
    Some(LspRange {
        start: LspPosition {
            line:      v.get("start")?.get("line")?.as_u64()? as u32,
            character: v.get("start")?.get("character")?.as_u64()? as u32,
        },
        end: LspPosition {
            line:      v.get("end")?.get("line")?.as_u64()? as u32,
            character: v.get("end")?.get("character")?.as_u64()? as u32,
        },
    })
}

fn extract_hover_content(v: &serde_json::Value) -> String {
    if let Some(contents) = v.get("contents") {
        if let Some(s) = contents.as_str() {
            return s.to_string();
        }
        if let Some(obj) = contents.as_object() {
            if let Some(val) = obj.get("value").and_then(|v| v.as_str()) {
                return val.to_string();
            }
        }
        if let Some(arr) = contents.as_array() {
            return arr
                .iter()
                .map(|item| {
                    item.get("value")
                        .and_then(|v| v.as_str())
                        .unwrap_or_else(|| item.as_str().unwrap_or(""))
                })
                .collect::<Vec<_>>()
                .join("\n\n");
        }
    }
    String::new()
}

fn parse_completion_item(v: &serde_json::Value) -> Option<CompletionItem> {
    let label = v.get("label")?.as_str()?.to_string();
    let insert_text = v.get("insertText")
        .and_then(|s| s.as_str())
        .unwrap_or(&label)
        .to_string();
    let kind = v.get("kind").and_then(|k| k.as_u64()).map(completion_kind_str);
    let detail = v.get("detail").and_then(|d| d.as_str()).map(String::from);
    let documentation = v
        .get("documentation")
        .and_then(|d| {
            if d.is_string() {
                d.as_str().map(String::from)
            } else {
                d.get("value").and_then(|v| v.as_str()).map(String::from)
            }
        });

    Some(CompletionItem { label, kind, detail, insert_text, documentation })
}

fn completion_kind_str(k: u64) -> String {
    match k {
        1  => "Text",       2  => "Method",    3  => "Function",
        4  => "Constructor",5  => "Field",      6  => "Variable",
        7  => "Class",      8  => "Interface",  9  => "Module",
        10 => "Property",   14 => "Keyword",    15 => "Snippet",
        _  => "Unknown",
    }.to_string()
}

/// Locate `rust-analyzer` binary via PATH.
fn which_ra() -> Option<PathBuf> {
    let name = if cfg!(windows) { "rust-analyzer.exe" } else { "rust-analyzer" };
    std::env::var_os("PATH")
        .and_then(|paths| {
            std::env::split_paths(&paths).find_map(|dir| {
                let candidate = dir.join(name);
                candidate.is_file().then_some(candidate)
            })
        })
}
