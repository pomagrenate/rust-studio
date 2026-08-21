use crate::settings::{UserSettings, load_settings, save_settings};

#[tauri::command]
pub fn get_user_settings() -> UserSettings {
    load_settings()
}

#[tauri::command]
pub fn save_user_settings(settings: UserSettings) -> Result<(), String> {
    save_settings(settings)
}
