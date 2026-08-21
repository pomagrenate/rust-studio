//! debugger/tests.rs — Integration test suite for DebuggerState management.

use super::*;
use debugger_embed::EmbeddedDebugger;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_debugger_state_session_lifecycle() {
    let engine = EmbeddedDebugger::init().unwrap();
    let state = Arc::new(DebuggerState {
        engine,
        active_session: Arc::new(Mutex::new(None)),
    });

    // 1. Initially no active session
    {
        let guard = state.active_session.lock();
        assert!(guard.is_none());
    }

    // 2. Spawn session directly into state
    let session = state.engine.spawn_session(None).unwrap();
    {
        let mut current = state.active_session.lock();
        *current = Some(session.clone_session());
    }

    // Verify session active
    {
        let guard = state.active_session.lock();
        assert!(guard.is_some());
        assert!(guard.as_ref().unwrap().is_running());
    }

    // Read initial banner message from session
    let session_ref = {
        let guard = state.active_session.lock();
        guard.as_ref().unwrap().clone_session()
    };
    let banner = session_ref.read_dap_message().unwrap().unwrap();
    assert!(banner.contains("Pomai Native In-Process DAP Engine active"));

    // 3. Send DAP message via active_session
    let req = json!({
        "seq": 1,
        "type": "request",
        "command": "initialize"
    }).to_string();

    session_ref.send_dap_message(&req).unwrap();
    let resp = session_ref.read_dap_message().unwrap().unwrap();
    let parsed: Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(parsed["command"], "initialize");

    // 4. Terminate active session
    {
        let mut guard = state.active_session.lock();
        if let Some(s) = guard.take() {
            s.terminate();
            assert!(!s.is_running());
        }
    }

    {
        let guard = state.active_session.lock();
        assert!(guard.is_none());
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_debugger_state_session_replacement() {
    let engine = EmbeddedDebugger::init().unwrap();
    let state = Arc::new(DebuggerState {
        engine,
        active_session: Arc::new(Mutex::new(None)),
    });

    // Spawn first session
    let s1 = state.engine.spawn_session(None).unwrap();
    {
        let mut current = state.active_session.lock();
        *current = Some(s1.clone_session());
    }

    // Replace with second session (simulating start_debug_session logic)
    let s2 = state.engine.spawn_session(None).unwrap();
    {
        let mut current = state.active_session.lock();
        if let Some(old) = current.take() {
            old.terminate();
            assert!(!old.is_running());
        }
        *current = Some(s2.clone_session());
    }

    // Verify active session is s2 and running
    {
        let guard = state.active_session.lock();
        assert!(guard.is_some());
        let active = guard.as_ref().unwrap();
        assert!(active.is_running());
    }

    // Cleanup
    {
        let mut guard = state.active_session.lock();
        if let Some(s) = guard.take() {
            s.terminate();
        }
    }
}
