use tauri::{AppHandle, WebviewWindowBuilder, WebviewUrl};

#[tauri::command]
pub async fn spawn_new_window(app: AppHandle) -> Result<(), String> {
    let window_label = format!(
        "editor_window_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let url = "index.html".to_string();

    WebviewWindowBuilder::new(&app, window_label, WebviewUrl::App(url.into()))
        .title("Pomai Studio")
        .inner_size(1024.0, 768.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn duplicate_workspace_window(app: AppHandle, folders: Vec<String>) -> Result<(), String> {
    let window_label = format!(
        "editor_window_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    // Encode folders as a comma-separated list or JSON in the query string
    let folders_json = serde_json::to_string(&folders).unwrap_or_default();
    let url = format!("index.html?folders={}", urlencoding::encode(&folders_json));

    WebviewWindowBuilder::new(&app, window_label, WebviewUrl::App(url.into()))
        .title("Pomai Studio")
        .inner_size(1024.0, 768.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
