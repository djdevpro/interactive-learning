//! The folder of the studio itself, `~/.interactive-learning`: its settings, the address where
//! agents reach the running studio, the journal of what they did, and downloaded updates.
//!
//! It is not in AppData: Windows redirects the writes of Store apps there, and Claude Desktop from
//! the Store starts the MCP server, which must find the same files as the studio. `IL_STUDIO_HOME`
//! moves it, as the self-test does.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static HOME: OnceLock<PathBuf> = OnceLock::new();

/// Chooses the folder once, before anything reads it. Without a call, `dir` uses the default.
pub fn init(folder: Option<PathBuf>) {
    let _ = HOME.set(folder.unwrap_or_else(default_dir));
}

fn default_dir() -> PathBuf {
    if let Some(folder) = std::env::var_os("IL_STUDIO_HOME") {
        return PathBuf::from(folder);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".interactive-learning")
}

pub fn dir() -> &'static Path {
    HOME.get_or_init(default_dir)
}

pub fn file(name: &str) -> PathBuf {
    dir().join(name)
}

/// The library of a creator who never chose one: `Documents/Interactive Learning`.
pub fn default_library() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Interactive Learning")
}

/// Writes next to the file first, then moves it in place, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

/// What the creator chose in Settings. A missing or unreadable file gives the defaults.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Looks for a new version on GitHub each time the studio starts.
    pub check_updates: bool,
    /// Lets AI agents drive the studio through its MCP server.
    pub agents: bool,
    /// The library folder, when the creator moved it away from `Documents/Interactive Learning`.
    pub library: Option<String>,
    /// `auto` to speak the language of the computer, or `en` or `fr`.
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            check_updates: true,
            agents: true,
            library: None,
            language: "auto".to_string(),
        }
    }
}

const SETTINGS_FILE: &str = "settings.json";

pub fn settings() -> Settings {
    std::fs::read_to_string(file(SETTINGS_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    write_atomic(&file(SETTINGS_FILE), format!("{text}\n").as_bytes())
}

/// The library the studio and its MCP server open: the one chosen in Settings, or the default.
pub fn library() -> PathBuf {
    settings()
        .library
        .filter(|folder| !folder.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_library)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_missing_fields_as_defaults() {
        let settings: Settings = serde_json::from_str(r#"{ "agents": false }"#).unwrap();
        assert_eq!(
            settings,
            Settings {
                check_updates: true,
                agents: false,
                library: None,
                language: "auto".to_string(),
            }
        );
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(settings, Settings::default());
    }
}
