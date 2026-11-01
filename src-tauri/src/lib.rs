use std::sync::Arc;

use tauri::{Manager, State};

mod action;
mod clicker;
mod hotkey;
mod profiles;

use clicker::{Clicker, ClickerConfig, StatusPayload};
use hotkey::HotkeyManager;
use profiles::{Profile, ProfileStore, ProfilesFile};

pub struct AppState {
    pub clicker: Arc<Clicker>,
    pub hotkeys: Arc<HotkeyManager>,
    pub profiles: Arc<ProfileStore>,
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> ClickerConfig {
    state.clicker.config()
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> StatusPayload {
    state.clicker.status()
}

#[tauri::command]
fn set_config(config: ClickerConfig, state: State<'_, AppState>) -> Result<(), String> {
    state
        .hotkeys
        .register(&config.hotkey)
        .map_err(|e| e.to_string())?;
    state.clicker.update_config(config);
    Ok(())
}

#[tauri::command]
fn start(state: State<'_, AppState>) -> StatusPayload {
    state.clicker.start();
    state.clicker.status()
}

#[tauri::command]
fn stop(state: State<'_, AppState>) -> StatusPayload {
    state.clicker.stop();
    state.clicker.status()
}

#[tauri::command]
fn toggle(state: State<'_, AppState>) -> StatusPayload {
    state.clicker.toggle();
    state.clicker.status()
}

#[tauri::command]
fn list_profiles(state: State<'_, AppState>) -> ProfilesFile {
    state.profiles.snapshot()
}

#[tauri::command]
fn create_profile(name: String, state: State<'_, AppState>) -> Result<Profile, String> {
    let config = state.clicker.config();
    state.profiles.create(name, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_profile(id: String, name: String, state: State<'_, AppState>) -> Result<Profile, String> {
    state.profiles.rename(&id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_profile(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.profiles.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_to_profile(id: String, state: State<'_, AppState>) -> Result<Profile, String> {
    let config = state.clicker.config();
    state
        .profiles
        .save_config(&id, config)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_profile(id: String, state: State<'_, AppState>) -> Result<ClickerConfig, String> {
    let profile = state
        .profiles
        .find(&id)
        .ok_or_else(|| "profile not found".to_string())?;
    state
        .hotkeys
        .register(&profile.config.hotkey)
        .map_err(|e| e.to_string())?;
    state.clicker.update_config(profile.config.clone());
    state
        .profiles
        .set_active(Some(id))
        .map_err(|e| e.to_string())?;
    Ok(profile.config)
}

#[tauri::command]
fn set_active_profile(id: Option<String>, state: State<'_, AppState>) -> Result<(), String> {
    state.profiles.set_active(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_profile(id: String, state: State<'_, AppState>) -> Result<String, String> {
    state.profiles.export_json(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_profile(json: String, state: State<'_, AppState>) -> Result<Profile, String> {
    state.profiles.import_json(&json).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn set_high_res_timer() {
    unsafe {
        winapi::um::timeapi::timeBeginPeriod(1);
    }
}

#[cfg(not(windows))]
fn set_high_res_timer() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    set_high_res_timer();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("resolve config dir: {e}"))?;
            let profiles = Arc::new(
                ProfileStore::load(app_config_dir)
                    .map_err(|e| format!("profile store init: {e}"))?,
            );

            let initial_config = profiles
                .snapshot()
                .active_id
                .and_then(|id| profiles.find(&id))
                .map(|p| p.config)
                .unwrap_or_default();

            let hotkeys = Arc::new(
                HotkeyManager::new()
                    .map_err(|e| format!("hotkey manager init failed: {e}"))?,
            );
            hotkeys
                .register(&initial_config.hotkey)
                .map_err(|e| format!("initial hotkey register failed: {e}"))?;

            let clicker = Arc::new(Clicker::new(app.handle().clone(), initial_config));

            HotkeyManager::start_listener(Arc::clone(&clicker), app.handle().clone());

            app.manage(AppState {
                clicker,
                hotkeys,
                profiles,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_status,
            set_config,
            start,
            stop,
            toggle,
            list_profiles,
            create_profile,
            rename_profile,
            delete_profile,
            save_to_profile,
            load_profile,
            set_active_profile,
            export_profile,
            import_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
