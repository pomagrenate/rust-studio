/// commands/viewport_commands.rs — Tauri commands for viewport layout.

use std::path::PathBuf;
use tauri::State;
use parking_lot::Mutex;
use std::collections::HashMap;

use crate::viewport::{ViewportManager, ViewportData};
use crate::document::DocumentRegistry;
use crate::buffer::TextBuffer;

/// Global viewport state. In a real multi-pane editor, this would be keyed by
/// editor pane ID. For Phase 1 we use path as the key.
pub struct ViewportRegistry(pub Mutex<HashMap<PathBuf, ViewportManager>>);

impl ViewportRegistry {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

/// Query the viewport layout for the current scroll position.
///
/// Returns `ViewportData` — the frontend uses this to create/recycle DOM nodes
/// for visible lines only. This is the core of the virtualized rendering approach.
///
/// Frontend call pattern (pseudo-code):
/// ```js
/// window.addEventListener('scroll', async () => {
///   const vp = await invoke('get_viewport_data', { path, scrollTop, viewportHeight });
///   const lines = await invoke('get_line_range', { path, startLine: vp.start_line, endLine: vp.end_line });
///   renderVisibleLines(vp, lines);
/// });
/// ```
#[tauri::command]
pub fn get_viewport_data(
    path: String,
    scroll_top: f64,
    viewport_height: f64,
    line_height: Option<f32>,
    viewport_registry: State<'_, ViewportRegistry>,
    doc_registry: State<'_, DocumentRegistry>,
) -> Result<ViewportData, String> {
    let path = PathBuf::from(&path);

    let line_count = {
        let doc_arc = doc_registry.get(&path)
            .ok_or_else(|| format!("Document not open: {}", path.display()))?;
        let count = doc_arc.read().buffer.len_lines();
        count
    };

    let mut vp_map = viewport_registry.0.lock();
    let vp = vp_map.entry(path).or_insert_with(|| {
        ViewportManager::new(line_count, line_height.unwrap_or(20.0), viewport_height)
    });

    // Update mutable state.
    vp.scroll_top      = scroll_top;
    vp.viewport_height = viewport_height;
    vp.line_count      = line_count;
    if let Some(h) = line_height {
        vp.default_line_height = h;
    }

    Ok(vp.get_viewport_data())
}

/// Programmatically scroll to a specific line (e.g. for "Go to Line").
#[tauri::command]
pub fn set_viewport_scroll(
    path: String,
    scroll_top: f64,
    viewport_registry: State<'_, ViewportRegistry>,
) -> Result<(), String> {
    let path = PathBuf::from(&path);
    let mut vp_map = viewport_registry.0.lock();
    if let Some(vp) = vp_map.get_mut(&path) {
        vp.scroll_top = scroll_top;
        Ok(())
    } else {
        Err(format!("No viewport for: {}", path.display()))
    }
}
