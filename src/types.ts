// Mirrors Rust's serde-tagged enum: `#[serde(tag = "kind", content = "value")]`.
// A Key action carries a raw KeyboardEvent.code string, so ANY physical key the
// OS surfaces maps straight through — no enum enumeration required.

export type ClickAction =
  | { kind: "MouseLeft" }
  | { kind: "MouseRight" }
  | { kind: "MouseMiddle" }
  | { kind: "Key"; value: { code: string } };

export interface Hotkey {
  code: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export interface ClickerConfig {
  action: ClickAction;
  interval_ms: number;
  stop_after: number | null;
  hotkey: Hotkey;
}

export interface StatusPayload {
  running: boolean;
  count: number;
  actual_cps: number;
}

export interface Profile {
  id: string;
  name: string;
  config: ClickerConfig;
}

export interface ProfilesFile {
  version: number;
  profiles: Profile[];
  active_id: string | null;
}

export const MOUSE_ACTIONS: Array<{ value: string; label: string; action: ClickAction; glyph: string }> = [
  { value: "mouse-left", label: "Left Click", action: { kind: "MouseLeft" }, glyph: "L" },
  { value: "mouse-right", label: "Right Click", action: { kind: "MouseRight" }, glyph: "R" },
  { value: "mouse-middle", label: "Middle Click", action: { kind: "MouseMiddle" }, glyph: "M" },
];

/** Short label for a `KeyboardEvent.code` ("KeyA" -> "A", "ArrowLeft" -> "←"). */
export function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "SPACE",
    Escape: "ESC",
    Enter: "ENTER",
    Backspace: "BKSP",
    Delete: "DEL",
    Insert: "INS",
    PageUp: "PGUP",
    PageDown: "PGDN",
    ControlLeft: "LCTRL",
    ControlRight: "RCTRL",
    ShiftLeft: "LSHIFT",
    ShiftRight: "RSHIFT",
    AltLeft: "LALT",
    AltRight: "RALT",
    MetaLeft: "LMETA",
    MetaRight: "RMETA",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Backquote: "`",
    Comma: ",",
    Period: ".",
    Slash: "/",
  };
  return named[code] ?? code;
}

export function describeAction(a: ClickAction): string {
  switch (a.kind) {
    case "MouseLeft":
      return "Left Click";
    case "MouseRight":
      return "Right Click";
    case "MouseMiddle":
      return "Middle Click";
    case "Key":
      return `Key: ${codeLabel(a.value.code)}`;
  }
}

export function describeHotkey(h: Hotkey): string {
  const parts: string[] = [];
  if (h.ctrl) parts.push("CTRL");
  if (h.shift) parts.push("SHIFT");
  if (h.alt) parts.push("ALT");
  if (h.meta) parts.push("META");
  parts.push(codeLabel(h.code));
  return parts.join(" + ");
}

export const CPS_PRESETS: Array<{ cps: number; label: string }> = [
  { cps: 5, label: "CHILL" },
  { cps: 20, label: "FAST" },
  { cps: 50, label: "WILD" },
  { cps: 100, label: "RAGE" },
  { cps: 1000, label: "MAX" },
];

export function cpsToIntervalMs(cps: number): number {
  if (cps <= 0) return 1000;
  return Math.max(1, Math.round(1000 / cps));
}

export function intervalMsToCps(ms: number): number {
  if (ms <= 0) return 1000;
  return Math.round(1000 / ms);
}
