//! fs/tests.rs — Unit and integration tests for filesystem operations.

use super::reader::{read_file_content, save_file_content, FsError};
use super::walker::{list_directory, EntryKind};
use tempfile::tempdir;
use tokio::fs;

#[tokio::test]
async fn test_read_and_save_file_content_atomic() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test_doc.txt");
    let content = "Hello Pomai Studio\nLine 2";

    // Save
    let save_res = save_file_content(&file_path, content).await;
    assert!(save_res.is_ok());
    assert!(file_path.exists());

    // Ensure temp file was cleaned up by atomic rename
    let tmp_path = file_path.with_extension(".pomai.tmp");
    assert!(!tmp_path.exists());

    // Read back
    let read_res = read_file_content(&file_path).await;
    assert!(read_res.is_ok());
    assert_eq!(read_res.unwrap(), content);
}

#[tokio::test]
async fn test_read_nonexistent_file_returns_io_error() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("nonexistent_12345.txt");

    let read_res = read_file_content(&file_path).await;
    assert!(read_res.is_err());
    if let Err(FsError::Io(err)) = read_res {
        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
    } else {
        panic!("Expected FsError::Io(NotFound)");
    }
}

#[tokio::test]
async fn test_read_invalid_utf8_returns_encoding_error() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("invalid_utf8.bin");
    let invalid_bytes = vec![0xFF, 0xFE, 0xFD];
    fs::write(&file_path, &invalid_bytes).await.unwrap();

    let read_res = read_file_content(&file_path).await;
    assert!(read_res.is_err());
    if let Err(FsError::Encoding(_)) = read_res {
        // Success
    } else {
        panic!("Expected FsError::Encoding");
    }
}

#[tokio::test]
async fn test_list_directory_sorting_and_metadata() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    // Create directories & files
    let sub_dir_b = root.join("dir_b");
    let sub_dir_a = root.join("dir_a");
    let file_z = root.join("z_file.txt");
    let file_a = root.join("a_file.txt");

    fs::create_dir(&sub_dir_b).await.unwrap();
    fs::create_dir(&sub_dir_a).await.unwrap();
    fs::write(&file_z, "z content").await.unwrap();
    fs::write(&file_a, "a content").await.unwrap();

    let entries = list_directory(root).await.unwrap();
    assert_eq!(entries.len(), 4);

    // Verify sort order: directories first (alphabetical), then files (alphabetical)
    assert_eq!(entries[0].name, "dir_a");
    assert_eq!(entries[0].kind, EntryKind::Directory);
    assert!(entries[0].size.is_none());

    assert_eq!(entries[1].name, "dir_b");
    assert_eq!(entries[1].kind, EntryKind::Directory);

    assert_eq!(entries[2].name, "a_file.txt");
    assert_eq!(entries[2].kind, EntryKind::File);
    assert_eq!(entries[2].size, Some(9));
    assert!(entries[2].modified.is_some());

    assert_eq!(entries[3].name, "z_file.txt");
    assert_eq!(entries[3].kind, EntryKind::File);
    assert_eq!(entries[3].size, Some(9));
}
