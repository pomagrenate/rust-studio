/// fs/walker.rs — Non-recursive, lazy directory listing.
///
/// VS Code equivalent: `IFileSystemProvider.readdir(uri)`.
///
/// Key design choice: readdir is intentionally non-recursive.
/// The sidebar tree expands lazily — when the user clicks a folder arrow,
/// we call readdir on that folder only. This keeps memory usage flat even
/// for workspaces with millions of files.

use std::path::{Path, PathBuf};
use std::time::SystemTime;
use serde::Serialize;
use tokio::fs;

/// Type of a file system entry — mirrors VS Code's `FileType` enum.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Directory,
    Symlink,
    Unknown,
}

/// A single directory entry, JSON-serialisable for the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FsEntry {
    /// File or directory name (not the full path).
    pub name: String,
    /// Absolute path.
    pub path: PathBuf,
    /// Type of entry.
    pub kind: EntryKind,
    /// File size in bytes (`None` for directories or when unavailable).
    pub size: Option<u64>,
    /// Last modification time as Unix timestamp seconds.
    pub modified: Option<u64>,
}

/// List the immediate children of a directory (non-recursive).
///
/// Returns entries sorted: directories first (alphabetical), then files (alphabetical).
/// This matches VS Code Explorer's default sort order.
pub async fn list_directory(path: &Path) -> Result<Vec<FsEntry>, std::io::Error> {
    let mut read_dir = fs::read_dir(path).await?;
    let mut entries = Vec::new();

    while let Some(entry) = read_dir.next_entry().await? {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().into_owned();

        // Skip hidden files (starting with '.') — configurable in Phase 2.
        // (Keeping them for now so the user sees everything.)

        let meta = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => {
                // Permission denied or broken symlink — include as Unknown.
                entries.push(FsEntry {
                    name,
                    path: entry.path(),
                    kind: EntryKind::Unknown,
                    size: None,
                    modified: None,
                });
                continue;
            }
        };

        let kind = if meta.is_symlink() {
            EntryKind::Symlink
        } else if meta.is_dir() {
            EntryKind::Directory
        } else {
            EntryKind::File
        };

        let size = if meta.is_file() { Some(meta.len()) } else { None };

        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        entries.push(FsEntry {
            name,
            path: entry.path(),
            kind,
            size,
            modified,
        });
    }

    // Sort: directories first, then files. Each group sorted alphabetically.
    entries.sort_by(|a, b| {
        let a_is_dir = a.kind == EntryKind::Directory;
        let b_is_dir = b.kind == EntryKind::Directory;
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}
