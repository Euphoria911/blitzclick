//! Micro-benchmark for the Windows timer-resolution fix.
//!
//! Prints how many `thread::sleep(1ms)` iterations complete in 1 second,
//! both with and without raising the OS timer resolution.
//!
//! Run with: `cargo run --example bench_sleep --release`

use std::thread;
use std::time::{Duration, Instant};

fn count_iters(target: Duration) -> (u64, Duration) {
    let start = Instant::now();
    let mut n: u64 = 0;
    while start.elapsed() < target {
        thread::sleep(Duration::from_millis(1));
        n += 1;
    }
    (n, start.elapsed())
}

fn main() {
    const WINDOW: Duration = Duration::from_secs(1);

    println!("blitzclick: sleep(1ms) throughput over {:?}", WINDOW);
    println!();

    #[cfg(windows)]
    {
        let (n_default, elapsed) = count_iters(WINDOW);
        println!(
            "WITHOUT timeBeginPeriod:  {} iters in {:?} => {:.1} Hz",
            n_default,
            elapsed,
            n_default as f64 / elapsed.as_secs_f64()
        );

        unsafe { winapi::um::timeapi::timeBeginPeriod(1) };
        let (n_fast, elapsed) = count_iters(WINDOW);
        unsafe { winapi::um::timeapi::timeEndPeriod(1) };
        println!(
            "WITH    timeBeginPeriod:  {} iters in {:?} => {:.1} Hz",
            n_fast,
            elapsed,
            n_fast as f64 / elapsed.as_secs_f64()
        );

        let speedup = n_fast as f64 / n_default as f64;
        println!();
        println!("speedup: {:.1}×", speedup);
    }

    #[cfg(not(windows))]
    {
        let (n, elapsed) = count_iters(WINDOW);
        println!(
            "{} iters in {:?} => {:.1} Hz",
            n,
            elapsed,
            n as f64 / elapsed.as_secs_f64()
        );
    }
}
