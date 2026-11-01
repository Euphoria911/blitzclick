//! Measures the achievable iteration rate of the v0.3.1+ hybrid sleep-spin
//! pacer at target intervals of 1 ms, 2 ms and 10 ms over a 1 s window.
//!
//! Run: `cargo run --example bench_pacer --release`

use std::thread;
use std::time::{Duration, Instant};

fn run(interval_ms: u64, window: Duration) -> (u64, Duration) {
    let interval = Duration::from_millis(interval_ms);
    let start = Instant::now();
    let mut next = start;
    let mut n: u64 = 0;
    while start.elapsed() < window {
        n += 1;
        next += interval;
        let remaining = next.saturating_duration_since(Instant::now());
        if remaining > Duration::from_millis(1) {
            thread::sleep(remaining - Duration::from_millis(1));
        }
        while Instant::now() < next {
            std::hint::spin_loop();
        }
    }
    (n, start.elapsed())
}

fn main() {
    #[cfg(windows)]
    unsafe {
        winapi::um::timeapi::timeBeginPeriod(1);
    }

    for interval_ms in [1u64, 2, 5, 10, 50] {
        let (n, elapsed) = run(interval_ms, Duration::from_secs(1));
        println!(
            "interval={:>3} ms  =>  {:>5} iters in {:?}  =>  {:>6.1} Hz",
            interval_ms,
            n,
            elapsed,
            n as f64 / elapsed.as_secs_f64()
        );
    }

    #[cfg(windows)]
    unsafe {
        winapi::um::timeapi::timeEndPeriod(1);
    }
}
