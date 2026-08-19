/// diagnostic_manager.rs — Consumes LSP server-push messages and streams
/// structured `DiagnosticBatch` events to the Tauri frontend.
///
/// Architecture:
///   RA stdout  ──►  LspHost reader task  ──►  mpsc::Receiver<Value>
///                                              │
///                                              ▼
///                                   DiagnosticManager::run()
///                                              │
///                          ┌──────────────────┼──────────────────┐
///                          ▼                  ▼                  ▼
///               publishDiagnostics      $/progress          window/logMsg
///                (debounce + emit)    (Indexing status)      (log only)
///
/// The manager runs in a dedicated Tokio task for the entire IDE session.

use std::sync::Arc;
use std::time::Duration;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::lsp::types::{Diagnostic, DiagnosticBatch, DiagnosticSeverity, LspPosition, LspRange, LspStatus};
use crate::lsp::cache_engine::CacheEngine;

// ── Events emitted to the frontend ────────────────────────────────────────
pub const EVENT_DIAGNOSTICS: &str    = "lsp://diagnostics";
pub const EVENT_LSP_STATUS: &str     = "lsp://status";
pub const EVENT_HOVER_RESULT: &str   = "lsp://hover";

// ── Debounce configuration ────────────────────────────────────────────────
/// How long to wait after the last edit before triggering re-analysis.
const DEBOUNCE_MS: u64 = 400;
/// How often the background debounce loop ticks.
const DEBOUNCE_TICK_MS: u64 = 100;

/// Owns a running Tokio task that consumes messages from `LspHost` and
/// emits `DiagnosticBatch` events to the Tauri webview.
pub struct DiagnosticManager;

impl DiagnosticManager {
    /// Spawn the background task. Returns immediately.
    pub fn spawn(
        app: AppHandle,
        cache: Arc<CacheEngine>,
        mut server_rx: mpsc::Receiver<Value>,
        cancel: CancellationToken,
    ) {
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(DEBOUNCE_TICK_MS));

            loop {
                tokio::select! {
                    _ = cancel.cancelled() => {
                        let _ = app.emit(EVENT_LSP_STATUS, LspStatus::Stopped);
                        break;
                    }

                    // Debounce ticker: flush documents that have been idle
                    _ = tick.tick() => {
                        let ready = cache.documents_needing_analysis(DEBOUNCE_MS);
                        for uri in ready {
                            cache.clear_pending(&uri);
                            // The LSP host already sent textDocument/didChange to RA.
                            // Diagnostics will arrive asynchronously via publishDiagnostics.
                            // Nothing to do here other than clear the pending flag.
                        }
                    }

                    // Incoming LSP server message
                    Some(msg) = server_rx.recv() => {
                        handle_server_message(&app, &cache, msg);
                    }
                }
            }
        });
    }
}

// ── Message dispatch ───────────────────────────────────────────────────────

fn handle_server_message(app: &AppHandle, _cache: &Arc<CacheEngine>, msg: Value) {
    let method = match msg.get("method").and_then(Value::as_str) {
        Some(m) => m,
        None => return, // response, not a notification — already handled by LspHost
    };

    match method {
        "textDocument/publishDiagnostics" => {
            if let Some(params) = msg.get("params") {
                if let Some(batch) = parse_publish_diagnostics(params) {
                    let _ = app.emit(EVENT_DIAGNOSTICS, &batch);
                }
            }
        }

        "$/progress" => {
            handle_progress(app, &msg);
        }

        "window/logMessage" | "window/showMessage" => {
            // Silently consume — could forward to a log panel in future
        }

        _ => { /* unknown notification — ignore */ }
    }
}

// ── Diagnostics parsing ───────────────────────────────────────────────────

fn parse_publish_diagnostics(params: &Value) -> Option<DiagnosticBatch> {
    let uri = params.get("uri")?.as_str()?.to_string();
    let version = params.get("version").and_then(Value::as_u64).unwrap_or(0) as u32;

    let raw_diags = match params.get("diagnostics").and_then(Value::as_array) {
        Some(arr) => arr,
        None => return Some(DiagnosticBatch { uri, version, diagnostics: vec![] }),
    };

    let diagnostics = raw_diags
        .iter()
        .filter_map(|d| parse_single_diagnostic(&uri, d))
        .collect();

    Some(DiagnosticBatch { uri, version, diagnostics })
}

fn parse_single_diagnostic(uri: &str, d: &Value) -> Option<Diagnostic> {
    let range  = parse_range(d.get("range")?)?;
    let message = d.get("message")?.as_str()?.to_string();
    let severity = d.get("severity")
        .and_then(Value::as_u64)
        .map(severity_from_lsp_int)
        .unwrap_or(DiagnosticSeverity::Error);

    let code = d.get("code").and_then(|c| {
        if c.is_string() {
            c.as_str().map(String::from)
        } else {
            c.as_u64().map(|n| n.to_string())
        }
    });

    let source = d.get("source").and_then(Value::as_str).map(String::from);

    Some(Diagnostic {
        uri: uri.to_string(),
        range,
        severity,
        code,
        message,
        source,
    })
}

fn parse_range(v: &Value) -> Option<LspRange> {
    Some(LspRange {
        start: parse_position(v.get("start")?)?,
        end:   parse_position(v.get("end")?)?,
    })
}

fn parse_position(v: &Value) -> Option<LspPosition> {
    Some(LspPosition {
        line:      v.get("line")?.as_u64()? as u32,
        character: v.get("character")?.as_u64()? as u32,
    })
}

fn severity_from_lsp_int(n: u64) -> DiagnosticSeverity {
    match n {
        1 => DiagnosticSeverity::Error,
        2 => DiagnosticSeverity::Warning,
        3 => DiagnosticSeverity::Information,
        4 => DiagnosticSeverity::Hint,
        _ => DiagnosticSeverity::Error,
    }
}

// ── Progress / Indexing status ────────────────────────────────────────────

fn handle_progress(app: &AppHandle, msg: &Value) {
    let params = match msg.get("params") { Some(p) => p, None => return };
    let value  = match params.get("value") { Some(v) => v, None => return };
    let kind   = value.get("kind").and_then(Value::as_str).unwrap_or("");

    match kind {
        "begin" => {
            let _ = app.emit(EVENT_LSP_STATUS, LspStatus::Indexing { percent: 0 });
        }
        "report" => {
            let percent = value
                .get("percentage")
                .and_then(Value::as_f64)
                .map(|p| p.round() as u8)
                .unwrap_or(50);
            let _ = app.emit(EVENT_LSP_STATUS, LspStatus::Indexing { percent });
        }
        "end" => {
            let _ = app.emit(EVENT_LSP_STATUS, LspStatus::Ready);
        }
        _ => {}
    }
}
