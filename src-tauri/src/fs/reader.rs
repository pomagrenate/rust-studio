/// fs/reader.rs — Async file read/write with encoding detection.
///
/// VS Code equivalent: `IFileService.readFile` / `writeFile`.
/// VS Code reads files as raw `Uint8Array` then decodes. We do the same:
/// read bytes, validate UTF-8, return the string.

use std::path::Path;
use tokio::fs;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FsError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File is not valid UTF-8: {0}")]
    Encoding(#[from] std::string::FromUtf8Error),

    #[error("File too large: {size} bytes (limit: {limit} bytes)")]
    TooLarge { size: u64, limit: u64 },
}

/// Maximum file size we'll load into a text buffer (256 MB).
/// Large files beyond this should use streaming / read-only mode.
pub const MAX_FILE_SIZE: u64 = 256 * 1024 * 1024;

/// Read a file from disk as a UTF-8 string.
///
/// - Uses `tokio::fs` for non-blocking I/O (never blocks the Tauri main thread)
/// - Checks the file size before reading to prevent OOM on huge binary files
/// - Returns the raw string for the caller (Document::from_content) to parse
pub async fn read_file_content(path: &Path) -> Result<String, FsError> {
    // Check size before reading.
    let meta = fs::metadata(path).await?;
    if meta.len() > MAX_FILE_SIZE {
        return Err(FsError::TooLarge {
            size: meta.len(),
            limit: MAX_FILE_SIZE,
        });
    }

    // Read bytes then validate UTF-8.
    let bytes = fs::read(path).await?;
    let content = String::from_utf8(bytes)?;
    Ok(content)
}

/// Write a document's content back to disk atomically.
///
/// Uses the same pattern as VS Code's `IFileAtomicWriteOptions`:
/// 1. Write to a temp file in the same directory
/// 2. Rename over the target (atomic on all major OSes)
///
/// This prevents data loss if the process crashes mid-write.
pub async fn save_file_content(path: &Path, content: &str) -> Result<(), FsError> {
    // Write to temp file first.
    let tmp_path = path.with_extension(".pomai.tmp");
    fs::write(&tmp_path, content.as_bytes()).await?;

    // Atomic rename.
    fs::rename(&tmp_path, path).await?;
    Ok(())
}
