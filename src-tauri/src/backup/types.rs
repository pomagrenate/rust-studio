use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub source_workspace: String,
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub archive_path: String,
}
