use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimelineEntry {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub detail: Option<String>,
    pub timestamp: String,
    pub source: String, // "git" | "local"
    pub icon: String,
}

#[tauri::command]
pub async fn get_file_timeline(file_path: String) -> Result<Vec<TimelineEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let mut entries = Vec::new();
        let path = Path::new(&file_path);
        
        if !path.exists() || !path.is_file() {
            return Ok(entries);
        }

        let parent_dir = match path.parent() {
            Some(p) if p.exists() => p,
            _ => return Ok(entries),
        };

        // Execute git log for the specified file
        let output = Command::new("git")
            .args(&["log", "--follow", "--format=%H|%h|%an|%ar|%s", "-n", "30", "--"])
            .arg(path)
            .current_dir(parent_dir)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let parts: Vec<&str> = line.splitn(5, '|').collect();
                    if parts.len() == 5 {
                        entries.push(TimelineEntry {
                            id: parts[0].to_string(),
                            label: parts[4].to_string(),
                            description: Some(parts[1].to_string()),
                            detail: Some(format!("{} • {}", parts[2], parts[3])),
                            timestamp: parts[3].to_string(),
                            source: "git".to_string(),
                            icon: "git-commit".to_string(),
                        });
                    }
                }
            }
        }

        Ok(entries)
    }).await.map_err(|e| e.to_string())?
}
