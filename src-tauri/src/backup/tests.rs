#[cfg(test)]
mod tests {
    use std::fs;
    use tempfile::tempdir;
    use crate::backup::manager::BackupManager;

    #[test]
    fn test_create_list_restore_delete_backup() {
        let src_dir = tempdir().unwrap();
        let backup_dir = tempdir().unwrap();
        let restore_dir = tempdir().unwrap();

        let file1 = src_dir.path().join("main.rs");
        fs::write(&file1, "fn main() { println!(\"hello\"); }").unwrap();

        let sub_folder = src_dir.path().join("src");
        fs::create_dir_all(&sub_folder).unwrap();
        let file2 = sub_folder.join("lib.rs");
        fs::write(&file2, "pub fn add(a: i32, b: i32) -> i32 { a + b }").unwrap();

        let meta = BackupManager::create_backup(
            src_dir.path().to_str().unwrap(),
            backup_dir.path().to_str().unwrap(),
            "Initial Backup",
            "Testing backup functionality",
        ).unwrap();

        assert_eq!(meta.name, "Initial Backup");
        assert_eq!(meta.file_count, 2);

        let list = BackupManager::list_backups(backup_dir.path().to_str().unwrap()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, meta.id);

        BackupManager::restore_backup(&meta.archive_path, restore_dir.path().to_str().unwrap()).unwrap();
        let restored_file1 = restore_dir.path().join("main.rs");
        assert!(restored_file1.exists());
        assert_eq!(fs::read_to_string(restored_file1).unwrap(), "fn main() { println!(\"hello\"); }");

        BackupManager::delete_backup(&meta.archive_path).unwrap();
        let list_after_del = BackupManager::list_backups(backup_dir.path().to_str().unwrap()).unwrap();
        assert_eq!(list_after_del.len(), 0);
    }
}
