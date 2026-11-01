use enigo::{Button, Direction, Enigo, Key, Keyboard, Mouse};
use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// A single automation target: a mouse button, or any physical key, identified
/// by the browser-standard `KeyboardEvent.code` string ("F6", "KeyA", "ArrowLeft",
/// "Numpad7", "Semicolon", ...). The frontend captures that value directly from
/// a real key event, so every key the OS knows about rides through unchanged.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum ClickAction {
    #[default]
    MouseLeft,
    MouseRight,
    MouseMiddle,
    Key {
        code: String,
    },
}

/// A chord that toggles the clicker when pressed anywhere on the system.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hotkey {
    pub code: String,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub meta: bool,
}

impl Default for Hotkey {
    fn default() -> Self {
        Hotkey {
            code: "F6".to_string(),
            shift: false,
            ctrl: false,
            alt: false,
            meta: false,
        }
    }
}

impl Hotkey {
    /// Build a global-hotkey entry from this binding. Returns None if the code
    /// isn't registrable as a system-wide hotkey (e.g. caps-lock).
    pub fn to_global(&self) -> Option<HotKey> {
        let code = Code::from_str(&self.code).ok()?;
        let mut mods = Modifiers::empty();
        if self.shift {
            mods |= Modifiers::SHIFT;
        }
        if self.ctrl {
            mods |= Modifiers::CONTROL;
        }
        if self.alt {
            mods |= Modifiers::ALT;
        }
        if self.meta {
            mods |= Modifiers::META;
        }
        Some(HotKey::new(Some(mods), code))
    }

    /// Human-readable label like "Ctrl+Shift+F6" for status/log output.
    pub fn label(&self) -> String {
        let mut parts: Vec<&str> = Vec::new();
        if self.ctrl {
            parts.push("Ctrl");
        }
        if self.shift {
            parts.push("Shift");
        }
        if self.alt {
            parts.push("Alt");
        }
        if self.meta {
            parts.push("Meta");
        }
        parts.push(self.code.as_str());
        parts.join("+")
    }
}

impl ClickAction {
    pub fn fire(&self, enigo: &mut Enigo) -> bool {
        let result = match self {
            ClickAction::MouseLeft => enigo.button(Button::Left, Direction::Click),
            ClickAction::MouseRight => enigo.button(Button::Right, Direction::Click),
            ClickAction::MouseMiddle => enigo.button(Button::Middle, Direction::Click),
            ClickAction::Key { code } => match code_to_enigo_key(code) {
                Some(k) => enigo.key(k, Direction::Click),
                None => return false,
            },
        };
        result.is_ok()
    }
}

/// Translate a `KeyboardEvent.code` string into an enigo keyboard key.
///
/// Covers alphanumerics, function keys F1-F24, numpad, nav cluster, modifiers,
/// and the common ASCII punctuation keys. Returns None for codes enigo can't
/// drive (CapsLock, ContextMenu, media keys, OS-specific codes).
pub fn code_to_enigo_key(code: &str) -> Option<Key> {
    if let Some(rest) = code.strip_prefix("Key") {
        let c = rest.chars().next()?;
        if c.is_ascii_alphabetic() {
            return Some(Key::Unicode(c.to_ascii_lowercase()));
        }
    }
    if let Some(rest) = code.strip_prefix("Digit") {
        let c = rest.chars().next()?;
        if c.is_ascii_digit() {
            return Some(Key::Unicode(c));
        }
    }
    if let Some(rest) = code.strip_prefix('F')
        && let Ok(n) = rest.parse::<u8>()
    {
        return match n {
            1 => Some(Key::F1),
            2 => Some(Key::F2),
            3 => Some(Key::F3),
            4 => Some(Key::F4),
            5 => Some(Key::F5),
            6 => Some(Key::F6),
            7 => Some(Key::F7),
            8 => Some(Key::F8),
            9 => Some(Key::F9),
            10 => Some(Key::F10),
            11 => Some(Key::F11),
            12 => Some(Key::F12),
            13 => Some(Key::F13),
            14 => Some(Key::F14),
            15 => Some(Key::F15),
            16 => Some(Key::F16),
            17 => Some(Key::F17),
            18 => Some(Key::F18),
            19 => Some(Key::F19),
            20 => Some(Key::F20),
            _ => None,
        };
    }
    if let Some(rest) = code.strip_prefix("Numpad") {
        if let Some(c) = rest.chars().next()
            && c.is_ascii_digit()
        {
            return Some(Key::Unicode(c));
        }
        return match rest {
            "Add" => Some(Key::Unicode('+')),
            "Subtract" => Some(Key::Unicode('-')),
            "Multiply" => Some(Key::Unicode('*')),
            "Divide" => Some(Key::Unicode('/')),
            "Decimal" => Some(Key::Unicode('.')),
            "Enter" => Some(Key::Return),
            _ => None,
        };
    }
    Some(match code {
        "Space" => Key::Space,
        "Enter" => Key::Return,
        "Tab" => Key::Tab,
        "Escape" => Key::Escape,
        "Backspace" => Key::Backspace,
        "Delete" => Key::Delete,
        "Insert" => Key::Other(0x2D),
        "Home" => Key::Home,
        "End" => Key::End,
        "PageUp" => Key::PageUp,
        "PageDown" => Key::PageDown,
        "ArrowLeft" => Key::LeftArrow,
        "ArrowRight" => Key::RightArrow,
        "ArrowUp" => Key::UpArrow,
        "ArrowDown" => Key::DownArrow,
        "ShiftLeft" | "ShiftRight" => Key::Shift,
        "ControlLeft" | "ControlRight" => Key::Control,
        "AltLeft" | "AltRight" => Key::Alt,
        "MetaLeft" | "MetaRight" => Key::Meta,
        "Minus" => Key::Unicode('-'),
        "Equal" => Key::Unicode('='),
        "BracketLeft" => Key::Unicode('['),
        "BracketRight" => Key::Unicode(']'),
        "Backslash" => Key::Unicode('\\'),
        "Semicolon" => Key::Unicode(';'),
        "Quote" => Key::Unicode('\''),
        "Backquote" => Key::Unicode('`'),
        "Comma" => Key::Unicode(','),
        "Period" => Key::Unicode('.'),
        "Slash" => Key::Unicode('/'),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn letters_map_to_lowercase_unicode() {
        let k = code_to_enigo_key("KeyA").unwrap();
        matches!(k, Key::Unicode('a')).then_some(()).unwrap();
        let k = code_to_enigo_key("KeyZ").unwrap();
        matches!(k, Key::Unicode('z')).then_some(()).unwrap();
    }

    #[test]
    fn digits_map_to_unicode() {
        matches!(code_to_enigo_key("Digit5").unwrap(), Key::Unicode('5'))
            .then_some(())
            .unwrap();
    }

    #[test]
    fn function_keys_map_to_fkey() {
        matches!(code_to_enigo_key("F1").unwrap(), Key::F1)
            .then_some(())
            .unwrap();
        matches!(code_to_enigo_key("F12").unwrap(), Key::F12)
            .then_some(())
            .unwrap();
        assert!(code_to_enigo_key("F99").is_none());
    }

    #[test]
    fn arrow_keys_resolve() {
        matches!(code_to_enigo_key("ArrowLeft").unwrap(), Key::LeftArrow)
            .then_some(())
            .unwrap();
    }

    #[test]
    fn numpad_digits_resolve() {
        matches!(code_to_enigo_key("Numpad7").unwrap(), Key::Unicode('7'))
            .then_some(())
            .unwrap();
    }

    #[test]
    fn modifier_codes_fold_sides() {
        matches!(code_to_enigo_key("ShiftLeft").unwrap(), Key::Shift)
            .then_some(())
            .unwrap();
        matches!(code_to_enigo_key("ShiftRight").unwrap(), Key::Shift)
            .then_some(())
            .unwrap();
    }

    #[test]
    fn unknown_code_rejected() {
        assert!(code_to_enigo_key("DefinitelyNotAKey").is_none());
    }

    #[test]
    fn default_hotkey_is_f6() {
        assert_eq!(Hotkey::default().code, "F6");
        assert_eq!(Hotkey::default().label(), "F6");
    }

    #[test]
    fn hotkey_label_includes_modifiers() {
        let h = Hotkey {
            code: "KeyA".into(),
            shift: true,
            ctrl: true,
            alt: false,
            meta: false,
        };
        assert_eq!(h.label(), "Ctrl+Shift+KeyA");
    }

    #[test]
    fn hotkey_to_global_builds_valid_binding() {
        let h = Hotkey::default();
        assert!(h.to_global().is_some());
    }

}
