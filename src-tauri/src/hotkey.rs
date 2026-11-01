use std::sync::Arc;
use std::thread;
use std::time::Duration;

use global_hotkey::hotkey::{HotKey, Modifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::action::KeyBinding;
use crate::clicker::Clicker;

pub struct HotkeyManager {
    inner: GlobalHotKeyManager,
    current: Mutex<Option<HotKey>>,
}

// Safety: On Windows the GlobalHotKeyManager holds an HWND for a hidden message
// window. We serialize all access through `current` (and the manager's own
// internal synchronization), and only register/unregister from Tauri commands
// which complete quickly. The listener thread reads from a separate crossbeam
// channel exposed by GlobalHotKeyEvent::receiver(), never touches `inner` directly.
unsafe impl Send for HotkeyManager {}
unsafe impl Sync for HotkeyManager {}

impl HotkeyManager {
    pub fn new() -> anyhow::Result<Self> {
        let inner = GlobalHotKeyManager::new()
            .map_err(|e| anyhow::anyhow!("creating hotkey manager: {e:?}"))?;
        Ok(Self {
            inner,
            current: Mutex::new(None),
        })
    }

    pub fn register(&self, binding: KeyBinding) -> anyhow::Result<()> {
        let Some(code) = binding.to_hotkey_code() else {
            anyhow::bail!("binding `{:?}` is not a valid hotkey", binding);
        };
        let hotkey = HotKey::new(Some(Modifiers::empty()), code);

        // Unregister old, then register new, holding the lock the whole time.
        let mut slot = self.current.lock();
        if let Some(old) = slot.take() {
            let _ = self.inner.unregister(old);
        }
        self.inner
            .register(hotkey)
            .map_err(|e| anyhow::anyhow!("register hotkey: {e:?}"))?;
        *slot = Some(hotkey);
        Ok(())
    }

    /// Start a listener thread that forwards hotkey Pressed events to
    /// `clicker.toggle()` and emits a `blitzclick://hotkey` event with the
    /// resulting running state.
    pub fn start_listener(clicker: Arc<Clicker>, app: AppHandle) {
        thread::spawn(move || {
            let rx = GlobalHotKeyEvent::receiver();
            loop {
                match rx.recv_timeout(Duration::from_secs(60)) {
                    Ok(ev) => {
                        if ev.state == HotKeyState::Pressed {
                            let now_running = clicker.toggle();
                            let _ = app.emit("blitzclick://hotkey", now_running);
                        }
                    }
                    Err(_) => {
                        // Timeout — just loop again. Keeps the thread alive without pinning CPU.
                    }
                }
            }
        });
    }
}
