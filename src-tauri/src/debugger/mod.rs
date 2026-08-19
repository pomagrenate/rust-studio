//! debugger/mod.rs — Tauri Commands and state management for CodeLLDB.

pub mod debugger_embed;

use debugger_embed::{EmbeddedDebugger, DapSession};
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct DebuggerState {
    pub engine: EmbeddedDebugger,
    pub active_session: Arc<Mutex<Option<DapSession>>>,
}

#[tauri::command]
pub async fn start_debug_session(
    app: AppHandle,
    working_dir: Option<String>,
    state: State<'_, Arc<DebuggerState>>,
) -> Result<String, String> {
    let cwd_path = working_dir.map(std::path::PathBuf::from);
    let session = state.engine.spawn_session(cwd_path.as_deref())?;

    {
        let mut current = state.active_session.lock();
        if let Some(old) = current.take() {
            old.terminate();
        }
        *current = Some(session.clone_session());
    }

    // Spawn reader thread that emits DAP events to frontend
    let reader_session = session;
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        while reader_session.is_running() {
            match reader_session.read_dap_message() {
                Ok(Some(msg)) => {
                    let _ = app_handle.emit("dap-event", msg);
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("[CodeLLDB Bridge] DAP stream closed or error: {e}");
                    break;
                }
            }
        }
        let _ = app_handle.emit("dap-terminated", ());
    });

    Ok(format!(
        "CodeLLDB initialized from {:?}",
        state.engine.executable_path()
    ))
}

#[tauri::command]
pub async fn send_dap_request(
    payload: String,
    state: State<'_, Arc<DebuggerState>>,
) -> Result<(), String> {
    let session_opt = {
        let guard = state.active_session.lock();
        guard.as_ref().map(|s| s.clone_session())
    };

    if let Some(session) = session_opt {
        session
            .send_dap_message(&payload)
            .map_err(|e| format!("Failed to send DAP message: {e}"))?;
        Ok(())
    } else {
        Err("No active debug session".to_string())
    }
}

#[tauri::command]
pub async fn stop_debug_session(
    state: State<'_, Arc<DebuggerState>>,
) -> Result<(), String> {
    let mut session_guard = state.active_session.lock();
    if let Some(session) = session_guard.take() {
        session.terminate();
    }
    Ok(())
}
