use crate::backup::types::BackupMetadata;
use crate::backup::manager::BackupManager;

#[tauri::command]
pub fn create_code_backup(
    workspacePath: String,
    backupDir: String,
    name: String,
    description: String,
) -> Result<BackupMetadata, String> {
    BackupManager::create_backup(&workspacePath, &backupDir, &name, &description)
}

#[tauri::command]
pub fn list_code_backups(backupDir: String) -> Result<Vec<BackupMetadata>, String> {
    BackupManager::list_backups(&backupDir)
}

#[tauri::command]
pub fn restore_code_backup(
    backupPath: String,
    targetWorkspacePath: String,
) -> Result<(), String> {
    BackupManager::restore_backup(&backupPath, &targetWorkspacePath)
}

#[tauri::command]
pub fn delete_code_backup(backupPath: String) -> Result<(), String> {
    BackupManager::delete_backup(&backupPath)
}
