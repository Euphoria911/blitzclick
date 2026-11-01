use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use enigo::{Enigo, Settings};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::action::{ClickAction, KeyBinding};

/// User-visible configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickerConfig {
    pub action: ClickAction,
    pub interval_ms: u64,
    /// None = run forever. Some(n) = stop automatically after n successful fires.
    pub stop_after: Option<u64>,
    pub hotkey: KeyBinding,
}

impl Default for ClickerConfig {
    fn default() -> Self {
        Self {
            action: ClickAction::MouseLeft,
            interval_ms: 50,
            stop_after: None,
            hotkey: KeyBinding::F(6),
        }
    }
}

/// Snapshot emitted to the frontend whenever running state changes.
#[derive(Debug, Clone, Serialize)]
pub struct StatusPayload {
    pub running: bool,
    pub count: u64,
}

pub struct Clicker {
    running: Arc<AtomicBool>,
    count: Arc<AtomicU64>,
    config: Arc<Mutex<ClickerConfig>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    app: AppHandle,
}

impl Clicker {
    pub fn new(app: AppHandle, initial: ClickerConfig) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            count: Arc::new(AtomicU64::new(0)),
            config: Arc::new(Mutex::new(initial)),
            worker: Mutex::new(None),
            app,
        }
    }

    pub fn status(&self) -> StatusPayload {
        StatusPayload {
            running: self.running.load(Ordering::Relaxed),
            count: self.count.load(Ordering::Relaxed),
        }
    }

    pub fn config(&self) -> ClickerConfig {
        self.config.lock().clone()
    }

    pub fn update_config(&self, new: ClickerConfig) {
        *self.config.lock() = new;
    }

    pub fn start(&self) {
        if self.running.swap(true, Ordering::SeqCst) {
            // Already running.
            return;
        }
        self.count.store(0, Ordering::Relaxed);
        self.emit_status();

        let running = Arc::clone(&self.running);
        let count = Arc::clone(&self.count);
        let config = Arc::clone(&self.config);
        let app = self.app.clone();

        let handle = thread::spawn(move || {
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("blitzclick: enigo init failed: {e}");
                    running.store(false, Ordering::SeqCst);
                    let _ = app.emit(
                        "blitzclick://status",
                        StatusPayload {
                            running: false,
                            count: 0,
                        },
                    );
                    return;
                }
            };

            while running.load(Ordering::Relaxed) {
                let (action, interval, stop_after) = {
                    let cfg = config.lock();
                    (cfg.action, cfg.interval_ms, cfg.stop_after)
                };

                if action.fire(&mut enigo) {
                    let new_count = count.fetch_add(1, Ordering::Relaxed) + 1;
                    if let Some(limit) = stop_after
                        && new_count >= limit
                    {
                        running.store(false, Ordering::SeqCst);
                        let _ = app.emit(
                            "blitzclick://status",
                            StatusPayload {
                                running: false,
                                count: new_count,
                            },
                        );
                        break;
                    }
                }

                if interval > 0 {
                    thread::sleep(Duration::from_millis(interval));
                }
            }
        });

        *self.worker.lock() = Some(handle);
    }

    pub fn stop(&self) {
        if !self.running.swap(false, Ordering::SeqCst) {
            return;
        }
        let handle = self.worker.lock().take();
        if let Some(h) = handle {
            let _ = h.join();
        }
        self.emit_status();
    }

    pub fn toggle(&self) -> bool {
        if self.running.load(Ordering::Relaxed) {
            self.stop();
            false
        } else {
            self.start();
            true
        }
    }

    fn emit_status(&self) {
        let _ = self.app.emit("blitzclick://status", self.status());
    }
}
