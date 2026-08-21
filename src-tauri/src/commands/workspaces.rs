use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RecentlyOpened {
    pub workspaces: Vec<String>,
    pub files: Vec<String>,
}

fn get_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push("recently_opened.json");
    Ok(path)
}

#[tauri::command]
pub fn get_recently_opened(app: AppHandle) -> Result<RecentlyOpened, String> {
    let path = get_storage_path(&app)?;
    
    if !path.exists() {
        return Ok(RecentlyOpened::default());
    }
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let recent: RecentlyOpened = serde_json::from_str(&content).unwrap_or_default();
    
    Ok(recent)
}

#[tauri::command]
pub fn add_recently_opened(app: AppHandle, path: String, is_folder: bool) -> Result<(), String> {
    let mut recent = get_recently_opened(app.clone())?;
    
    if is_folder {
        // Remove if exists to move to top
        recent.workspaces.retain(|p| p != &path);
        recent.workspaces.insert(0, path);
        // Keep only top 20
        if recent.workspaces.len() > 20 {
            recent.workspaces.truncate(20);
        }
    } else {
        recent.files.retain(|p| p != &path);
        recent.files.insert(0, path);
        if recent.files.len() > 20 {
            recent.files.truncate(20);
        }
    }
    
    let storage_path = get_storage_path(&app)?;
    let content = serde_json::to_string_pretty(&recent).map_err(|e| e.to_string())?;
    fs::write(storage_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn clear_recently_opened(app: AppHandle) -> Result<(), String> {
    let storage_path = get_storage_path(&app)?;
    if storage_path.exists() {
        fs::remove_file(storage_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_recently_opened(app: AppHandle, path: String) -> Result<(), String> {
    let mut recent = get_recently_opened(app.clone())?;
    recent.workspaces.retain(|p| p != &path);
    recent.files.retain(|p| p != &path);
    
    let storage_path = get_storage_path(&app)?;
    let content = serde_json::to_string_pretty(&recent).map_err(|e| e.to_string())?;
    fs::write(storage_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkspaceFolder {
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PomaiWorkspace {
    pub folders: Vec<WorkspaceFolder>,
}

#[tauri::command]
pub fn save_workspace_as(path: String, folders: Vec<String>) -> Result<(), String> {
    let workspace = PomaiWorkspace {
        folders: folders.into_iter().map(|p| WorkspaceFolder { path: p }).collect(),
    };
    
    let content = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_save_workspace_as() {
        let dir = tempdir().unwrap();
        let ws_path = dir.path().join("my_workspace.code-workspace").to_string_lossy().to_string();

        let folders = vec![
            "E:/GithubProjects/pomai-studio".to_string(),
            "E:/GithubProjects/cheesepath".to_string(),
        ];

        save_workspace_as(ws_path.clone(), folders.clone()).unwrap();

        let content = fs::read_to_string(&ws_path).unwrap();
        let workspace: PomaiWorkspace = serde_json::from_str(&content).unwrap();

        assert_eq!(workspace.folders.len(), 2);
        assert_eq!(workspace.folders[0].path, folders[0]);
        assert_eq!(workspace.folders[1].path, folders[1]);
    }

    #[test]
    fn test_recently_opened_struct_mutations() {
        let mut recent = RecentlyOpened::default();
        assert!(recent.workspaces.is_empty());
        assert!(recent.files.is_empty());

        recent.workspaces.push("folder1".to_string());
        recent.files.push("file1.rs".to_string());

        assert_eq!(recent.workspaces.len(), 1);
        assert_eq!(recent.files.len(), 1);
    }
}
