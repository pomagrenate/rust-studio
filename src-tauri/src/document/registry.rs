/// document/registry.rs — Global concurrent document registry.
///
/// Manages all open documents. Uses `DashMap` (a lock-free concurrent HashMap)
/// so multiple Tauri commands can access different documents simultaneously
/// without a single global lock.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use dashmap::DashMap;
use parking_lot::RwLock;

use super::Document;

/// Thread-safe, shareable registry of all open documents.
///
/// Use `Arc::clone(&registry)` to share across Tauri's managed state and async tasks.
pub struct DocumentRegistry {
    /// Key: canonical absolute path.
    /// Value: a shared, RwLock-guarded Document.
    ///
    /// Using `parking_lot::RwLock` (instead of std) for:
    /// - No poisoning on panic
    /// - ~2× faster on low-contention workloads
    docs: DashMap<PathBuf, Arc<RwLock<Document>>>,

    /// Counter for untitled documents (Untitled-1, Untitled-2, ...).
    untitled_counter: std::sync::atomic::AtomicUsize,
}

impl DocumentRegistry {
    pub fn new() -> Self {
        Self {
            docs: DashMap::new(),
            untitled_counter: std::sync::atomic::AtomicUsize::new(1),
        }
    }

    /// Open a document from content. If the path is already open, returns
    /// the existing document (no double-load).
    pub fn open(&self, path: PathBuf, content: &str) -> Arc<RwLock<Document>> {
        // Return existing if already open.
        if let Some(existing) = self.docs.get(&path) {
            return Arc::clone(existing.value());
        }

        let doc = Document::from_content(content, Some(path.clone()));
        let shared = Arc::new(RwLock::new(doc));
        self.docs.insert(path, Arc::clone(&shared));
        shared
    }

    /// Create a new untitled document (not backed by a file yet).
    pub fn open_untitled(&self) -> (String, Arc<RwLock<Document>>) {
        let n = self.untitled_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let name = format!("Untitled-{}", n);
        let doc = Document::new_untitled();
        let shared = Arc::new(RwLock::new(doc));
        // Store under a fake path so we can look it up by name.
        let fake_path = PathBuf::from(format!("untitled://{}", name));
        self.docs.insert(fake_path, Arc::clone(&shared));
        (name, shared)
    }

    /// Get a document by path. Returns `None` if not open.
    pub fn get(&self, path: &Path) -> Option<Arc<RwLock<Document>>> {
        self.docs.get(path).map(|r| Arc::clone(r.value()))
    }

    /// Close a document. If it has unsaved changes the caller must confirm first.
    pub fn close(&self, path: &Path) -> bool {
        self.docs.remove(path).is_some()
    }

    /// Returns the number of currently open documents.
    pub fn len(&self) -> usize {
        self.docs.len()
    }
}

impl Default for DocumentRegistry {
    fn default() -> Self {
        Self::new()
    }
}
