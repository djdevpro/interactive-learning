//! The language of the studio: English or French, the language of the computer unless Settings
//! chose one. The interface carries its own texts; the messages that come from here, such as
//! the errors it shows, are written in both languages with `tr!`.
//!
//! What only AI agents read through the MCP server stays in English, the language of the tools.

use std::sync::atomic::{AtomicBool, Ordering};

static FRENCH: AtomicBool = AtomicBool::new(false);

/// The language of the computer as a BCP 47 tag, such as `fr-FR`.
pub fn system() -> String {
    sys_locale::get_locale().unwrap_or_else(|| "en".to_string())
}

/// `en` or `fr`, from a choice of Settings: `auto` follows the computer.
pub fn resolve(choice: &str, system: &str) -> &'static str {
    match choice {
        "fr" => "fr",
        "en" => "en",
        _ if system.trim().to_lowercase().starts_with("fr") => "fr",
        _ => "en",
    }
}

/// Speaks the language of this choice from now on.
pub fn apply(choice: &str) {
    FRENCH.store(resolve(choice, &system()) == "fr", Ordering::Relaxed);
}

pub fn french() -> bool {
    FRENCH.load(Ordering::Relaxed)
}

/// A message in the language of the studio, written in English then in French, with the
/// arguments of `format!`.
#[macro_export]
macro_rules! tr {
    ($en:literal, $fr:literal $(, $($argument:tt)*)?) => {
        if $crate::i18n::french() {
            format!($fr $(, $($argument)*)?)
        } else {
            format!($en $(, $($argument)*)?)
        }
    };
}

/// The language of the computer, for the interface to choose its texts.
#[tauri::command]
pub fn system_locale() -> String {
    system()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_the_computer_unless_settings_chose() {
        assert_eq!(resolve("auto", "fr-FR"), "fr");
        assert_eq!(resolve("auto", "fr_CA.UTF-8"), "fr");
        assert_eq!(resolve("auto", "en-US"), "en");
        assert_eq!(resolve("auto", "de-DE"), "en");
        assert_eq!(resolve("en", "fr-FR"), "en");
        assert_eq!(resolve("fr", "en-GB"), "fr");
    }

    #[test]
    fn writes_messages_in_both_languages() {
        let name = "Billing";
        FRENCH.store(true, Ordering::Relaxed);
        assert_eq!(
            tr!("{name} is gone.", "{name} n'est plus là."),
            "Billing n'est plus là."
        );
        FRENCH.store(false, Ordering::Relaxed);
        assert_eq!(
            tr!("{name} is gone.", "{name} n'est plus là."),
            "Billing is gone."
        );
    }
}
