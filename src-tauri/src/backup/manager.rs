use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

use crate::backup::types::BackupMetadata;

pub struct BackupManager;

impl BackupManager {
    /// Creates a production-ready local code backup of the target workspace.
    pub fn create_backup(
        workspace_path: &str,
        backup_dir: &str,
        name: &str,
        description: &str,
    ) -> Result<BackupMetadata, String> {
        let src_root = Path::new(workspace_path);
        if !src_root.exists() {
            return Err("Source workspace path does not exist".to_string());
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();

        let backup_id = format!("backup_{}", timestamp);
        let dest_dir = Path::new(backup_dir).join(&backup_id);
        let snapshot_dir = dest_dir.join("snapshot");

        fs::create_dir_all(&snapshot_dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;

        let mut file_count = 0usize;
        let mut total_size_bytes = 0u64;

        for entry in WalkDir::new(src_root)
            .into_iter()
            .filter_entry(|e| {
                let file_name = e.file_name().to_string_lossy();
                file_name != "node_modules"
                    && file_name != "target"
                    && file_name != ".git"
                    && file_name != "dist"
                    && file_name != ".next"
                    && file_name != "build"
            })
            .filter_map(|e| e.ok())
        {
            let src_path = entry.path();
            if src_path.is_file() {
                if let Ok(rel_path) = src_path.strip_prefix(src_root) {
                    let dest_file_path = snapshot_dir.join(rel_path);
                    if let Some(parent) = dest_file_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }

                    if let Ok(bytes) = fs::copy(src_path, &dest_file_path) {
                        file_count += 1;
                        total_size_bytes += bytes;
                    }
                }
            }
        }

        let meta = BackupMetadata {
            id: backup_id,
            name: if name.trim().is_empty() { "Local Code Snapshot".to_string() } else { name.trim().to_string() },
            description: description.trim().to_string(),
            created_at: chrono::Local::now().to_rfc3339(),
            source_workspace: workspace_path.to_string(),
            file_count,
            total_size_bytes,
            archive_path: dest_dir.to_string_lossy().to_string(),
        };

        let meta_json_path = dest_dir.join("backup_meta.json");
        let meta_str = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Failed to serialize backup metadata: {}", e))?;
        fs::write(meta_json_path, meta_str)
            .map_err(|e| format!("Failed to write metadata file: {}", e))?;

        Ok(meta)
    }

    /// Lists all local code backups in the given backup directory.
    pub fn list_backups(backup_dir: &str) -> Result<Vec<BackupMetadata>, String> {
        let dir = Path::new(backup_dir);
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                let meta_file = path.join("backup_meta.json");
                if meta_file.exists() {
                    if let Ok(content) = fs::read_to_string(&meta_file) {
                        if let Ok(meta) = serde_json::from_str::<BackupMetadata>(&content) {
                            backups.push(meta);
                        }
                    }
                }
            }
        }

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    /// Restores a local code backup into the target workspace directory.
    pub fn restore_backup(backup_path: &str, target_workspace_path: &str) -> Result<(), String> {
        let backup_root = Path::new(backup_path);
        let snapshot_dir = backup_root.join("snapshot");
        if !snapshot_dir.exists() {
            return Err("Invalid backup: snapshot folder not found".to_string());
        }

        let target_root = Path::new(target_workspace_path);
        fs::create_dir_all(target_root).map_err(|e| format!("Failed to create target directory: {}", e))?;

        for entry in WalkDir::new(&snapshot_dir).into_iter().filter_map(|e| e.ok()) {
            let src_file = entry.path();
            if src_file.is_file() {
                if let Ok(rel_path) = src_file.strip_prefix(&snapshot_dir) {
                    let dest_file = target_root.join(rel_path);
                    if let Some(parent) = dest_file.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    fs::copy(src_file, dest_file)
                        .map_err(|e| format!("Failed to copy file during restore: {}", e))?;
                }
            }
        }

        Ok(())
    }

    /// Deletes a local backup directory.
    pub fn delete_backup(backup_path: &str) -> Result<(), String> {
        let path = PathBuf::from(backup_path);
        if path.exists() {
            fs::remove_dir_all(path).map_err(|e| format!("Failed to delete backup: {}", e))?;
        }
        Ok(())
    }
}
