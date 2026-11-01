# blitzclick

A fast, retro-styled desktop autoclicker. Pick a mouse button or any keyboard key, dial the interval down to **1 ms (1000 CPS)**, bind a global hotkey, and go.

![status](https://img.shields.io/badge/status-stable-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-magenta)

## Features

- **Target any key** — left/right/middle mouse click, or any physical keyboard key (letters, F1–F24, numpad, arrows, punctuation — press-to-bind, no dropdown gymnastics)
- **Any CPS you want** — type a direct number for CPS or ms, pick a preset chip (CHILL / FAST / WILD / RAGE / MAX), hit ~600 CPS on Windows
- **Live actual-CPS meter** — hero display shows the real measured click rate while running, not a theoretical target
- **Any hotkey chord** — bind a system-wide toggle (default **F6**) with full modifier support (Ctrl/Shift/Alt/Meta)
- **Stop condition** — run forever, or auto-stop after N clicks
- **Native** — single ~4 MB desktop app, no browser, no Electron bloat
- **Retro UI** — [RetroUI](https://retroui.dev) components, pixel font, CRT scanline overlay, color-coded cards

## Performance

On the Windows worker loop the sleep granularity caps top speed around **~600 CPS at `interval_ms = 1`**. The engine also calls `timeBeginPeriod(1)` at startup to guarantee ~1ms sleep resolution even when no other process has raised the global timer. The hero meter displays the **actual** measured rate so you always see ground truth.

## Install

### Windows

Grab the latest from [releases](https://github.com/Euphoria911/blitzclick/releases):

- **`blitzclick_<ver>_x64-setup.exe`** — NSIS installer (recommended, ~1.5 MB)
- **`blitzclick_<ver>_x64_en-US.msi`** — MSI installer (~2.1 MB)
- Or just grab `blitzclick.exe` for a portable binary

### macOS / Linux

Build from source (see Development below). Prebuilt bundles may land in a future release.

## Usage

1. Launch `blitzclick`.
2. **Target** — pick the mouse button or keyboard key to spam.
3. **Speed** — drag the slider; the CPS counter updates live.
4. **Stop After** — toggle on to cap the run at N clicks, or leave off to run forever.
5. **Hotkey** — choose F1–F12 (default **F6**).
6. Press **START** in the app *or* your chosen hotkey anywhere on the desktop.

Press the hotkey again (or the big STOP button) to halt.

## How it works

```
┌──────────────────────────┐           ┌─────────────────────────┐
│  React + RetroUI frontend │           │  Rust backend            │
│  (@base-ui + Tailwind v4) │           │  (Tauri 2 commands)      │
│  Target picker, slider,   │ ──invoke→ │  Clicker  (worker thread)│
│  hotkey menu, live counter│ ←─event── │  Hotkey   (OS-wide hook) │
└──────────────────────────┘           │  Action   (serde enums)  │
                                        └─────────────────────────┘
                                                     │
                                                     ↓
                                              enigo → OS input
                                              global-hotkey → OS
```

- Click/key injection via [`enigo`](https://crates.io/crates/enigo) (SendInput on Windows, uinput on Linux, CGEvent on macOS).
- Global hotkey via [`global-hotkey`](https://crates.io/crates/global-hotkey).
- UI shell by [Tauri 2](https://tauri.app/); frontend bundled with Vite + React 19.
- Styling via [RetroUI](https://retroui.dev) components (shadcn-style, Base UI primitives, Tailwind v4).

## Caveats

- **Windows antivirus heuristics** may flag any autoclicker as a "generic PUA" since the technique overlaps with input-automation malware. The binary is unsigned in v0.1 — if your AV complains, right-click → Properties → Unblock, or whitelist the folder.
- **Games with anti-cheat systems** (Valorant, EAC, BattlEye) will detect `SendInput` and either ignore the clicks or ban you. Don't use blitzclick with those.
- **1 ms = 1000 CPS is the ceiling the OS can reliably deliver.** Sub-millisecond intervals aren't supported; even 1 ms may drop to ~500–800 CPS in practice depending on the receiving application's input queue.

## Development

Prerequisites: **Rust** (stable), **Node 20+**, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (WebView2 is preinstalled on Windows 11).

```bash
git clone https://github.com/Euphoria911/blitzclick
cd blitzclick
npm install
npm run tauri dev        # launches the app with hot reload
npm run tauri build      # produces release binaries + installers
```

Rust-side unit tests:

```bash
cd src-tauri
cargo test --lib
cargo clippy --all-targets -- -D warnings
```

## License

MIT
