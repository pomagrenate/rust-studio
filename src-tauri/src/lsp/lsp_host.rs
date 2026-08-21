/// lsp_host.rs — Orchestrates a `rust-analyzer` child process via LSP over stdio.
///
/// Architecture:
///   ┌──────────────────────────────────────────────────────────────┐
///   │  Tauri Commands  ──►  LspHost  ──►  RA child process (stdio) │
///   │                       │                                       │
///   │  Tauri Events   ◄──  DiagnosticManager  ◄──  RA stdout msgs  │
///   └──────────────────────────────────────────────────────────────┘
///
/// Communication is fully async (Tokio). The RA child process is never
/// joined on the hot path — all reads/writes go through dedicated tasks.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::lsp::types::{LspCapabilities, LspStatus, CodeAction, LspRange, LspPosition};

/// An in-flight LSP request waiting for a response.
type PendingRequests = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

/// One message sent from LspHost to the RA writer task.
#[allow(dead_code)]
enum WriterMsg {
    Raw(Vec<u8>),
    Shutdown,
}

/// The main handle to the running LSP host.  
/// Clone-safe — all fields are Arc-wrapped.
#[derive(Clone)]
pub struct LspHost {
    /// Monotonically increasing LSP request ID.
    next_id: Arc<AtomicU64>,
    /// Send raw LSP messages to the RA stdin writer task.
    writer_tx: mpsc::Sender<WriterMsg>,
    /// Pending requests awaiting a response (id → oneshot sender).
    pending: PendingRequests,
    /// Current server status, shared with Tauri state.
    pub status: Arc<Mutex<LspStatus>>,
    /// Cancellation handle — drop or cancel to stop all background tasks.
    cancel: CancellationToken,
}

impl LspHost {
    /// Spawn `rust-analyzer` and wire up async reader/writer tasks.
    /// Returns the `LspHost` handle and an `mpsc::Receiver` that yields
    /// raw server→client JSON messages for the DiagnosticManager to consume.
    pub async fn spawn(
        ra_binary: PathBuf,
        workspace_root: PathBuf,
    ) -> Result<(Self, mpsc::Receiver<Value>)> {
        let mut child: Child = Command::new(&ra_binary)
            .current_dir(&workspace_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("Failed to spawn rust-analyzer at {:?}", ra_binary))?;

        let stdin: ChildStdin = child.stdin.take().ok_or_else(|| anyhow!("RA stdin unavailable"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("RA stdout unavailable"))?;

        let (writer_tx, writer_rx) = mpsc::channel::<WriterMsg>(256);
        let (server_msg_tx, server_msg_rx) = mpsc::channel::<Value>(512);

        let cancel = CancellationToken::new();
        let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
        let status = Arc::new(Mutex::new(LspStatus::Starting));

        // ── Stdin writer task ──────────────────────────────────────────────
        {
            let cancel_c = cancel.clone();
            tokio::spawn(stdin_writer_task(stdin, writer_rx, cancel_c));
        }

        // ── Stdout reader task ────────────────────────────────────────────
        {
            let pending_c = Arc::clone(&pending);
            let cancel_c = cancel.clone();
            tokio::spawn(stdout_reader_task(stdout, server_msg_tx, pending_c, cancel_c));
        }

        // ── Reap child when cancelled ─────────────────────────────────────
        {
            let cancel_c = cancel.clone();
            tokio::spawn(async move {
                cancel_c.cancelled().await;
                drop(child); // kill_on_drop ensures RA terminates
            });
        }

        let host = LspHost {
            next_id: Arc::new(AtomicU64::new(1)),
            writer_tx,
            pending,
            status,
            cancel,
        };

        // Send LSP `initialize` request immediately.
        host.send_initialize(&workspace_root).await?;

        Ok((host, server_msg_rx))
    }

    /// Send a raw LSP request and await the response (`result` field).
    /// Returns an error on timeout or server failure.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let msg = lsp_message(Some(id), method, params);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(id, tx);

        self.writer_tx
            .send(WriterMsg::Raw(msg))
            .await
            .map_err(|_| anyhow!("LSP writer channel closed"))?;

        tokio::time::timeout(std::time::Duration::from_secs(120), rx)
            .await
            .map_err(|_| anyhow!("LSP request '{}' timed out", method))?
            .map_err(|_| anyhow!("LSP response channel dropped for '{}'", method))
    }

    /// Fire-and-forget LSP notification (no response expected).
    pub async fn notify(&self, method: &str, params: Value) -> Result<()> {
        let msg = lsp_message(None, method, params);
        self.writer_tx
            .send(WriterMsg::Raw(msg))
            .await
            .map_err(|_| anyhow!("LSP writer channel closed"))
    }

    /// Gracefully shut down the RA server.
    pub async fn shutdown(&self) {
        let _ = self.request("shutdown", json!(null)).await;
        let _ = self.notify("exit", json!(null)).await;
        self.cancel.cancel();
    }

    /// Returns the capabilities negotiated during `initialize`.
    pub fn capabilities(&self) -> LspCapabilities {
        LspCapabilities {
            hover: true,
            goto_definition: true,
            goto_implementation: true,
            completion: true,
            diagnostics: true,
        }
    }

    /// Request goto definition at a specific position
    pub async fn goto_definition(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Value> {
        self.request(
            "textDocument/definition",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        )
        .await
    }

    /// Request goto implementation at a specific position
    pub async fn goto_implementation(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Value> {
        self.request(
            "textDocument/implementation",
            json!({
                "textDocument": { "uri": uri },
                "position": { "line": line, "character": character }
            }),
        )
        .await
    }

    /// Request code actions at a specific position
    pub async fn code_actions(
        &self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<CodeAction>> {
        let range = LspRange {
            start: LspPosition { line, character },
            end: LspPosition { line, character },
        };

        let result = self
            .request(
                "textDocument/codeAction",
                json!({
                    "textDocument": { "uri": uri },
                    "range": range,
                    "context": {
                        "diagnostics": []
                    }
                }),
            )
            .await?;

        // Parse the result into CodeAction structs
        let actions = if let Some(arr) = result.as_array() {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        } else {
            Vec::new()
        };

        Ok(actions)
    }

    // ── LSP Lifecycle ──────────────────────────────────────────────────────

    async fn send_initialize(&self, workspace_root: &PathBuf) -> Result<()> {
        let root_uri = path_to_uri(workspace_root);

        let result = self
            .request(
                "initialize",
                json!({
                    "processId": std::process::id(),
                    "clientInfo": { "name": "pomai-studio", "version": "0.1.0" },
                    "rootUri": root_uri,
                    "capabilities": {
                        "textDocument": {
                            "publishDiagnostics": { "relatedInformation": true, "versionSupport": true },
                            "hover": { "contentFormat": ["markdown", "plaintext"] },
                            "completion": { "completionItem": { "snippetSupport": true } }
                        },
                        "workspace": {
                            "didChangeWatchedFiles": { "dynamicRegistration": false }
                        }
                    }
                }),
            )
            .await?;

        if result.get("capabilities").is_some() {
            *self.status.lock() = LspStatus::Ready;
            // Acknowledge
            let _ = self.notify("initialized", json!({})).await;
        }

        Ok(())
    }
}

// ── Background Tasks ───────────────────────────────────────────────────────

/// Writes LSP frames to RA's stdin. Each frame: `Content-Length: N\r\n\r\n<JSON>`.
async fn stdin_writer_task(
    mut stdin: ChildStdin,
    mut rx: mpsc::Receiver<WriterMsg>,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            msg = rx.recv() => {
                match msg {
                    Some(WriterMsg::Raw(bytes)) => {
                        if stdin.write_all(&bytes).await.is_err() { break; }
                    }
                    Some(WriterMsg::Shutdown) | None => break,
                }
            }
        }
    }
}

/// Reads LSP frames from RA's stdout, dispatches responses to pending senders,
/// forwards notifications/server-initiated messages to the `server_msg_tx` channel.
async fn stdout_reader_task(
    stdout: tokio::process::ChildStdout,
    server_msg_tx: mpsc::Sender<Value>,
    pending: PendingRequests,
    cancel: CancellationToken,
) {
    let mut reader = BufReader::new(stdout);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            result = read_lsp_frame(&mut reader) => {
                match result {
                    Ok(frame) => {
                        let msg: Value = match serde_json::from_str(&frame) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        dispatch_message(msg, &pending, &server_msg_tx).await;
                    }
                    Err(_) => break, // RA closed stdout — process likely exited
                }
            }
        }
    }
}

/// Read one LSP content-length-framed message from the buffered reader.
async fn read_lsp_frame(reader: &mut BufReader<tokio::process::ChildStdout>) -> Result<String> {
    let mut content_length: usize = 0;

    // Read headers until blank line
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            return Err(anyhow!("EOF"));
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break; // blank line ends headers
        }
        if let Some(val) = line.strip_prefix("Content-Length: ") {
            content_length = val.trim().parse().unwrap_or(0);
        }
    }

    if content_length == 0 {
        return Err(anyhow!("zero content-length"));
    }

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).await?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

/// Route a parsed LSP message to either a pending response handler or the broadcast channel.
async fn dispatch_message(msg: Value, pending: &PendingRequests, tx: &mpsc::Sender<Value>) {
    // It's a response if it has an `id` at the top level and no `method`.
    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
        if msg.get("method").is_none() {
            if let Some(sender) = pending.lock().remove(&id) {
                let result = msg.get("result").cloned().unwrap_or(Value::Null);
                let _ = sender.send(result);
                return;
            }
        }
    }
    // Everything else (notifications, server-initiated requests) goes to the channel.
    let _ = tx.try_send(msg);
}

// ── Utilities ──────────────────────────────────────────────────────────────

/// Encode an LSP JSON-RPC message as a framed byte vector.
fn lsp_message(id: Option<u64>, method: &str, params: Value) -> Vec<u8> {
    let mut obj = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });
    if let Some(id) = id {
        obj["id"] = json!(id);
    }
    let body = obj.to_string();
    format!("Content-Length: {}\r\n\r\n{}", body.len(), body)
        .into_bytes()
}

/// Convert a filesystem path to a `file://` URI (cross-platform).
pub fn path_to_uri(path: &PathBuf) -> String {
    let s = path.to_string_lossy();
    if cfg!(windows) {
        format!("file:///{}", s.replace('\\', "/"))
    } else {
        format!("file://{}", s)
    }
}
