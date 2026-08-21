use std::fs;
use std::path::Path;
use serde::Serialize;

#[derive(Serialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&path).map_err(|e| e.to_string())? ;

    for entry in read_dir {
        if let Ok(entry) = entry {
            let path_buf = entry.path();
            let kind = if path_buf.is_dir() { "directory" } else { "file" };
            entries.push(FsEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: path_buf.to_string_lossy().into_owned(),
                kind: kind.to_string(),
            });
        }
    }

    // Sort: directories first, then files alphabetically
    entries.sort_by(|a, b| {
        if a.kind == b.kind {
            a.name.cmp(&b.name)
        } else if a.kind == "directory" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())
    } else {
        Err(format!("Path does not exist: {}", path))
    }
}

#[tauri::command]
pub async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_path(src: String, dest: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dest_path = Path::new(&dest);

    if src_path.is_dir() {
        copy_dir_all(src_path, dest_path).map_err(|e| e.to_string())
    } else {
        fs::copy(src_path, dest_path).map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn move_path(src: String, dest: String) -> Result<(), String> {
    fs::rename(&src, &dest).map_err(|e| e.to_string())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn create_rust_file(path: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Default Rust file boilerplate template
    let template = r#"//! Module documentation

pub fn init() {
    println!("Hello from module!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
"#;
    
    fs::write(&path, template).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_rust_module(path: String) -> Result<(), String> {
    // Create module directory
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    
    // Create mod.rs file in the module directory
    let mod_rs_path = Path::new(&path).join("mod.rs");
    let template = r#"//! Module declaration and submodules

// pub mod submodule;
"#;
    
    fs::write(mod_rs_path, template).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cargo_crate(path: String, name: String) -> Result<(), String> {
    use std::process::Command;
    
    // Create parent directory if needed
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Run cargo new command
    let output = Command::new("cargo")
        .args(["new", &name])
        .current_dir(Path::new(&path).parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to run cargo new: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("cargo new failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(())
}

#[tauri::command]
pub async fn create_scratch_file(path: String) -> Result<(), String> {
    // Create parent directories if needed
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let template = r#"// Scratch Buffer - Temporary testing and snippet area
fn main() {
    println!("Scratch buffer executed");
}
"#;
    
    fs::write(&path, template).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_fs_create_read_save_delete() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("sub/test.txt").to_string_lossy().to_string();

        // 1. Create file (with missing parent directory)
        create_file(file_path.clone()).await.unwrap();
        assert!(Path::new(&file_path).exists());

        // 2. Save content
        save_file(file_path.clone(), "Hello Pomai Studio!".to_string()).await.unwrap();

        // 3. Read content
        let content = read_file(file_path.clone()).await.unwrap();
        assert_eq!(content, "Hello Pomai Studio!");

        // 4. Delete file
        delete_path(file_path.clone()).await.unwrap();
        assert!(!Path::new(&file_path).exists());
    }

    #[tokio::test]
    async fn test_list_dir_sorting() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create files & directories
        fs::create_dir_all(root.join("b_dir")).unwrap();
        fs::create_dir_all(root.join("a_dir")).unwrap();
        fs::write(root.join("z_file.txt"), "z").unwrap();
        fs::write(root.join("a_file.txt"), "a").unwrap();

        let entries = list_dir(root.to_string_lossy().to_string()).await.unwrap();
        assert_eq!(entries.len(), 4);

        // Directories first (a_dir, b_dir), then files (a_file.txt, z_file.txt)
        assert_eq!(entries[0].name, "a_dir");
        assert_eq!(entries[0].kind, "directory");
        assert_eq!(entries[1].name, "b_dir");
        assert_eq!(entries[1].kind, "directory");
        assert_eq!(entries[2].name, "a_file.txt");
        assert_eq!(entries[2].kind, "file");
        assert_eq!(entries[3].name, "z_file.txt");
        assert_eq!(entries[3].kind, "file");
    }

    #[tokio::test]
    async fn test_copy_dir_all_and_rename() {
        let dir = tempdir().unwrap();
        let src_dir = dir.path().join("src_folder");
        let dest_dir = dir.path().join("dest_folder");

        fs::create_dir_all(src_dir.join("nested")).unwrap();
        fs::write(src_dir.join("nested/file.txt"), "nested content").unwrap();

        // Copy directory tree
        copy_path(src_dir.to_string_lossy().to_string(), dest_dir.to_string_lossy().to_string()).await.unwrap();
        assert!(dest_dir.join("nested/file.txt").exists());

        // Rename directory
        let moved_dir = dir.path().join("moved_folder");
        move_path(dest_dir.to_string_lossy().to_string(), moved_dir.to_string_lossy().to_string()).await.unwrap();
        assert!(!dest_dir.exists());
        assert!(moved_dir.join("nested/file.txt").exists());
    }

    #[tokio::test]
    async fn test_rust_boilerplate_generators() {
        let dir = tempdir().unwrap();
        let rust_file = dir.path().join("lib.rs").to_string_lossy().to_string();
        let mod_dir = dir.path().join("submod").to_string_lossy().to_string();
        let scratch_file = dir.path().join("scratch.rs").to_string_lossy().to_string();

        create_rust_file(rust_file.clone()).await.unwrap();
        assert!(read_file(rust_file).await.unwrap().contains("pub fn init()"));

        create_rust_module(mod_dir.clone()).await.unwrap();
        let mod_rs = Path::new(&mod_dir).join("mod.rs").to_string_lossy().to_string();
        assert!(read_file(mod_rs).await.unwrap().contains("//! Module declaration"));

        create_scratch_file(scratch_file.clone()).await.unwrap();
        assert!(read_file(scratch_file).await.unwrap().contains("Scratch Buffer"));
    }
}