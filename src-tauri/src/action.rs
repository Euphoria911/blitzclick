use enigo::{Button, Direction, Enigo, Key, Keyboard, Mouse};
use global_hotkey::hotkey::Code;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum ClickAction {
    #[default]
    MouseLeft,
    MouseRight,
    MouseMiddle,
    Key(KeyBinding),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum KeyBinding {
    Space,
    Enter,
    Tab,
    Escape,
    Backspace,
    F(u8),       // 1..=12
    Char(char),  // single ASCII char: a-z, 0-9, punctuation
    Shift,
    Control,
    Alt,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
}

impl Default for KeyBinding {
    // Manual: the default is F(6), which isn't a unit variant so `#[default]` doesn't apply.
    fn default() -> Self {
        KeyBinding::F(6)
    }
}

impl KeyBinding {
    /// Map to enigo's keyboard Key for firing synthetic key events.
    pub fn to_enigo_key(self) -> Key {
        match self {
            KeyBinding::Space => Key::Space,
            KeyBinding::Enter => Key::Return,
            KeyBinding::Tab => Key::Tab,
            KeyBinding::Escape => Key::Escape,
            KeyBinding::Backspace => Key::Backspace,
            KeyBinding::F(n) => match n {
                1 => Key::F1,
                2 => Key::F2,
                3 => Key::F3,
                4 => Key::F4,
                5 => Key::F5,
                6 => Key::F6,
                7 => Key::F7,
                8 => Key::F8,
                9 => Key::F9,
                10 => Key::F10,
                11 => Key::F11,
                12 => Key::F12,
                _ => Key::F6,
            },
            KeyBinding::Char(c) => Key::Unicode(c),
            KeyBinding::Shift => Key::Shift,
            KeyBinding::Control => Key::Control,
            KeyBinding::Alt => Key::Alt,
            KeyBinding::ArrowLeft => Key::LeftArrow,
            KeyBinding::ArrowRight => Key::RightArrow,
            KeyBinding::ArrowUp => Key::UpArrow,
            KeyBinding::ArrowDown => Key::DownArrow,
        }
    }

    /// Map to global-hotkey's Code enum for registering OS-wide hotkeys.
    pub fn to_hotkey_code(self) -> Option<Code> {
        Some(match self {
            KeyBinding::Space => Code::Space,
            KeyBinding::Enter => Code::Enter,
            KeyBinding::Tab => Code::Tab,
            KeyBinding::Escape => Code::Escape,
            KeyBinding::Backspace => Code::Backspace,
            KeyBinding::F(n) => match n {
                1 => Code::F1,
                2 => Code::F2,
                3 => Code::F3,
                4 => Code::F4,
                5 => Code::F5,
                6 => Code::F6,
                7 => Code::F7,
                8 => Code::F8,
                9 => Code::F9,
                10 => Code::F10,
                11 => Code::F11,
                12 => Code::F12,
                _ => return None,
            },
            KeyBinding::Char(c) => match c.to_ascii_lowercase() {
                'a' => Code::KeyA, 'b' => Code::KeyB, 'c' => Code::KeyC,
                'd' => Code::KeyD, 'e' => Code::KeyE, 'f' => Code::KeyF,
                'g' => Code::KeyG, 'h' => Code::KeyH, 'i' => Code::KeyI,
                'j' => Code::KeyJ, 'k' => Code::KeyK, 'l' => Code::KeyL,
                'm' => Code::KeyM, 'n' => Code::KeyN, 'o' => Code::KeyO,
                'p' => Code::KeyP, 'q' => Code::KeyQ, 'r' => Code::KeyR,
                's' => Code::KeyS, 't' => Code::KeyT, 'u' => Code::KeyU,
                'v' => Code::KeyV, 'w' => Code::KeyW, 'x' => Code::KeyX,
                'y' => Code::KeyY, 'z' => Code::KeyZ,
                '0' => Code::Digit0, '1' => Code::Digit1, '2' => Code::Digit2,
                '3' => Code::Digit3, '4' => Code::Digit4, '5' => Code::Digit5,
                '6' => Code::Digit6, '7' => Code::Digit7, '8' => Code::Digit8,
                '9' => Code::Digit9,
                _ => return None,
            },
            KeyBinding::Shift => Code::ShiftLeft,
            KeyBinding::Control => Code::ControlLeft,
            KeyBinding::Alt => Code::AltLeft,
            KeyBinding::ArrowLeft => Code::ArrowLeft,
            KeyBinding::ArrowRight => Code::ArrowRight,
            KeyBinding::ArrowUp => Code::ArrowUp,
            KeyBinding::ArrowDown => Code::ArrowDown,
        })
    }
}

impl ClickAction {
    /// Fire a single instance of this action using the given Enigo instance.
    /// Returns true on success, false on failure (which is logged, not fatal).
    pub fn fire(self, enigo: &mut Enigo) -> bool {
        let result = match self {
            ClickAction::MouseLeft => enigo.button(Button::Left, Direction::Click),
            ClickAction::MouseRight => enigo.button(Button::Right, Direction::Click),
            ClickAction::MouseMiddle => enigo.button(Button::Middle, Direction::Click),
            ClickAction::Key(kb) => enigo.key(kb.to_enigo_key(), Direction::Click),
        };
        result.is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hotkey_codes_cover_fkeys() {
        assert_eq!(KeyBinding::F(6).to_hotkey_code(), Some(Code::F6));
        assert_eq!(KeyBinding::F(1).to_hotkey_code(), Some(Code::F1));
        assert_eq!(KeyBinding::F(12).to_hotkey_code(), Some(Code::F12));
        assert_eq!(KeyBinding::F(99).to_hotkey_code(), None);
    }

    #[test]
    fn hotkey_codes_cover_letters_case_insensitive() {
        assert_eq!(KeyBinding::Char('a').to_hotkey_code(), Some(Code::KeyA));
        assert_eq!(KeyBinding::Char('Z').to_hotkey_code(), Some(Code::KeyZ));
    }

    #[test]
    fn hotkey_rejects_unknown_chars() {
        assert_eq!(KeyBinding::Char('!').to_hotkey_code(), None);
    }

    #[test]
    fn default_hotkey_is_f6() {
        assert_eq!(KeyBinding::default(), KeyBinding::F(6));
    }
}
