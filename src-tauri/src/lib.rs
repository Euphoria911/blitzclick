use std::sync::Arc;

use tauri::{Manager, State};

mod action;
mod clicker;
mod hotkey;

use clicker::{Clicker, ClickerConfig, StatusPayload};
use hotkey::HotkeyManager;

pub struct AppState {
    pub clicker: Arc<Clicker>,
    pub hotkeys: Arc<HotkeyManager>,
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
fn set_config(
    config: ClickerConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Register the new hotkey first so the user gets a clean error if it's bad.
    state
        .hotkeys
        .register(config.hotkey)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config = ClickerConfig::default();

            let hotkeys = Arc::new(
                HotkeyManager::new()
                    .map_err(|e| format!("hotkey manager init failed: {e}"))?,
            );
            hotkeys
                .register(config.hotkey)
                .map_err(|e| format!("initial hotkey register failed: {e}"))?;

            let clicker = Arc::new(Clicker::new(app.handle().clone(), config));

            HotkeyManager::start_listener(Arc::clone(&clicker), app.handle().clone());

            app.manage(AppState {
                clicker,
                hotkeys,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
