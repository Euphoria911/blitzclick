use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use enigo::{Enigo, Settings};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::action::{ClickAction, Hotkey};

/// User-visible configuration. interval_ms is clamped to >= 1 by the worker loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickerConfig {
    pub action: ClickAction,
    pub interval_ms: u64,
    /// None = run forever. Some(n) = stop automatically after n successful fires.
    pub stop_after: Option<u64>,
    pub hotkey: Hotkey,
}

impl Default for ClickerConfig {
    fn default() -> Self {
        Self {
            action: ClickAction::MouseLeft,
            interval_ms: 50,
            stop_after: None,
            hotkey: Hotkey::default(),
        }
    }
}

/// Snapshot emitted to the frontend. `actual_cps` is a 500ms rolling average of
/// the real fire rate as measured inside the worker loop — ground truth, not
/// a derived target.
#[derive(Debug, Clone, Serialize)]
pub struct StatusPayload {
    pub running: bool,
    pub count: u64,
    pub actual_cps: f64,
}

pub struct Clicker {
    running: Arc<AtomicBool>,
    count: Arc<AtomicU64>,
    /// Measured clicks-per-second, encoded as (f64 bits) in a u64 so it fits in an atomic.
    actual_cps_bits: Arc<AtomicU64>,
    config: Arc<Mutex<ClickerConfig>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    app: AppHandle,
}

impl Clicker {
    pub fn new(app: AppHandle, initial: ClickerConfig) -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            count: Arc::new(AtomicU64::new(0)),
            actual_cps_bits: Arc::new(AtomicU64::new(0)),
            config: Arc::new(Mutex::new(initial)),
            worker: Mutex::new(None),
            app,
        }
    }

    pub fn status(&self) -> StatusPayload {
        StatusPayload {
            running: self.running.load(Ordering::Relaxed),
            count: self.count.load(Ordering::Relaxed),
            actual_cps: f64::from_bits(self.actual_cps_bits.load(Ordering::Relaxed)),
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
            return;
        }
        self.count.store(0, Ordering::Relaxed);
        self.actual_cps_bits.store(0, Ordering::Relaxed);
        self.emit_status();

        let running = Arc::clone(&self.running);
        let count = Arc::clone(&self.count);
        let actual_cps_bits = Arc::clone(&self.actual_cps_bits);
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
                            actual_cps: 0.0,
                        },
                    );
                    return;
                }
            };

            let mut measure_anchor = Instant::now();
            let mut measure_anchor_count: u64 = 0;
            const MEASURE_WINDOW: Duration = Duration::from_millis(500);

            while running.load(Ordering::Relaxed) {
                let (action, interval, stop_after) = {
                    let cfg = config.lock();
                    (cfg.action.clone(), cfg.interval_ms.max(1), cfg.stop_after)
                };

                if action.fire(&mut enigo) {
                    let new_count = count.fetch_add(1, Ordering::Relaxed) + 1;
                    if let Some(limit) = stop_after
                        && new_count >= limit
                    {
                        actual_cps_bits.store(0, Ordering::Relaxed);
                        running.store(false, Ordering::SeqCst);
                        let _ = app.emit(
                            "blitzclick://status",
                            StatusPayload {
                                running: false,
                                count: new_count,
                                actual_cps: 0.0,
                            },
                        );
                        break;
                    }

                    let now = Instant::now();
                    let elapsed = now.duration_since(measure_anchor);
                    if elapsed >= MEASURE_WINDOW {
                        let delta = (new_count - measure_anchor_count) as f64;
                        let secs = elapsed.as_secs_f64();
                        let rate = if secs > 0.0 { delta / secs } else { 0.0 };
                        actual_cps_bits.store(rate.to_bits(), Ordering::Relaxed);
                        measure_anchor = now;
                        measure_anchor_count = new_count;
                    }
                }

                thread::sleep(Duration::from_millis(interval));
            }

            actual_cps_bits.store(0, Ordering::Relaxed);
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
        self.actual_cps_bits.store(0, Ordering::Relaxed);
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
