// Mirrors Rust's serde-tagged enums (tag = "kind", content = "value").

export type ClickAction =
  | { kind: "MouseLeft" }
  | { kind: "MouseRight" }
  | { kind: "MouseMiddle" }
  | { kind: "Key"; value: KeyBinding };

export type KeyBinding =
  | { kind: "Space" }
  | { kind: "Enter" }
  | { kind: "Tab" }
  | { kind: "Escape" }
  | { kind: "Backspace" }
  | { kind: "F"; value: number }
  | { kind: "Char"; value: string }
  | { kind: "Shift" }
  | { kind: "Control" }
  | { kind: "Alt" }
  | { kind: "ArrowLeft" }
  | { kind: "ArrowRight" }
  | { kind: "ArrowUp" }
  | { kind: "ArrowDown" };

export interface ClickerConfig {
  action: ClickAction;
  interval_ms: number;
  stop_after: number | null;
  hotkey: KeyBinding;
}

export interface StatusPayload {
  running: boolean;
  count: number;
}

/* ------- UI helpers for turning enums into dropdown values ------- */

export const MOUSE_ACTIONS = [
  { value: "mouse-left", label: "Left Click", action: { kind: "MouseLeft" } as ClickAction },
  { value: "mouse-right", label: "Right Click", action: { kind: "MouseRight" } as ClickAction },
  { value: "mouse-middle", label: "Middle Click", action: { kind: "MouseMiddle" } as ClickAction },
] as const;

export const KEY_OPTIONS: Array<{ value: string; label: string; binding: KeyBinding }> = [
  { value: "space", label: "Space", binding: { kind: "Space" } },
  { value: "enter", label: "Enter", binding: { kind: "Enter" } },
  { value: "tab", label: "Tab", binding: { kind: "Tab" } },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: `f${i + 1}`,
    label: `F${i + 1}`,
    binding: { kind: "F", value: i + 1 } as KeyBinding,
  })),
  ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
      "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"].map((c) => ({
    value: `char-${c}`,
    label: c.toUpperCase(),
    binding: { kind: "Char", value: c } as KeyBinding,
  })),
];

export const HOTKEY_OPTIONS: Array<{ value: string; label: string; binding: KeyBinding }> =
  Array.from({ length: 12 }, (_, i) => ({
    value: `f${i + 1}`,
    label: `F${i + 1}`,
    binding: { kind: "F", value: i + 1 } as KeyBinding,
  }));

export function describeAction(a: ClickAction): string {
  switch (a.kind) {
    case "MouseLeft":
      return "Left Click";
    case "MouseRight":
      return "Right Click";
    case "MouseMiddle":
      return "Middle Click";
    case "Key":
      return `Key: ${describeKey(a.value)}`;
  }
}

export function describeKey(k: KeyBinding): string {
  switch (k.kind) {
    case "F":
      return `F${k.value}`;
    case "Char":
      return k.value.toUpperCase();
    default:
      return k.kind;
  }
}

export function keyBindingToOptionValue(k: KeyBinding): string {
  switch (k.kind) {
    case "F":
      return `f${k.value}`;
    case "Char":
      return `char-${k.value}`;
    case "Space":
      return "space";
    case "Enter":
      return "enter";
    case "Tab":
      return "tab";
    default:
      return k.kind.toLowerCase();
  }
}

export function actionToOptionValue(a: ClickAction): string {
  if (a.kind === "Key") return keyBindingToOptionValue(a.value);
  return a.kind === "MouseLeft"
    ? "mouse-left"
    : a.kind === "MouseRight"
      ? "mouse-right"
      : "mouse-middle";
}
