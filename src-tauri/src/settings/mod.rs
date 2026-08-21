use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub editor_font_size: u32,
    pub editor_font_family: String,
    pub editor_line_height: f64,
    pub editor_font_ligatures: bool,
    pub ui_font_size: u32,
    pub ui_font_family: String,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            editor_font_size: 14,
            editor_font_family: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace".to_string(),
            editor_line_height: 1.5,
            editor_font_ligatures: true,
            ui_font_size: 13,
            ui_font_family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif".to_string(),
        }
    }
}

pub fn get_settings_path() -> PathBuf {
    let base_dir = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    
    let dir = base_dir.join("pomai-studio");
    let _ = fs::create_dir_all(&dir);
    dir.join("settings.json")
}

pub fn load_settings() -> UserSettings {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<UserSettings>(&content) {
                return settings;
            }
        }
    }
    UserSettings::default()
}

pub fn save_settings(settings: UserSettings) -> Result<(), String> {
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write settings file: {}", e))
}
