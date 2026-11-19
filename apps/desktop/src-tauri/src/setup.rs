//! The studio declared in AI agents, for every project: Claude Code, read in `~/.claude.json` and
//! changed with its `claude` command, and Codex, read in `~/.codex/config.toml` and changed with
//! `codex mcp add`. A declaration that Claude Code keeps for one folder hides the global one in
//! that folder, so connecting removes it, and every project sees the same studio.
//!
//! The skill that teaches agents to make tutorials comes with the studio, and installs in
//! `~/.claude/skills` and `~/.agents/skills`, where Claude Code and Codex read skills.

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::mcp::NAME;

/// The skill of the repository, built into the studio.
pub const SKILL: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../skills/interactive-learning/SKILL.md"
));

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Skill {
    Missing,
    Current,
    /// Installed, but another version than the one of this studio.
    Outdated,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    /// The program it starts for the studio, when it knows the studio.
    declared: Option<String>,
    /// Declared for every project, with this copy of the studio.
    connected: bool,
    /// Folders where Claude Code keeps a declaration of its own.
    local: Vec<String>,
    skill: Skill,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agents {
    exe: String,
    name: &'static str,
    claude: Client,
    codex: Client,
    claude_command: String,
    codex_command: String,
    /// The block for clients configured in JSON, such as Claude Desktop or Cursor.
    json: String,
    tools: Vec<String>,
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn exe() -> String {
    std::env::current_exe()
        .map(|exe| exe.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn same_path(a: &str, b: &str) -> bool {
    let normal = |text: &str| {
        text.trim()
            .trim_matches('"')
            .replace('/', "\\")
            .to_lowercase()
    };
    normal(a) == normal(b)
}

// ---- Claude Code -------------------------------------------------------------------------------

fn claude_config() -> PathBuf {
    match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(folder) => PathBuf::from(folder).join(".claude.json"),
        None => home().join(".claude.json"),
    }
}

/// The global command and the folders with a declaration of their own, in a `.claude.json`.
pub fn claude_from_config(config: &Value) -> (Option<String>, Vec<String>) {
    let global = config["mcpServers"][NAME]["command"]
        .as_str()
        .map(str::to_string);
    let mut local: Vec<String> = config["projects"]
        .as_object()
        .map(|projects| {
            projects
                .iter()
                .filter(|(_, project)| !project["mcpServers"][NAME].is_null())
                .map(|(folder, _)| folder.clone())
                .collect()
        })
        .unwrap_or_default();
    local.sort();
    (global, local)
}

fn claude_read() -> (Option<String>, Vec<String>) {
    std::fs::read_to_string(claude_config())
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .map(|config| claude_from_config(&config))
        .unwrap_or_default()
}

pub fn claude_command(exe: &str) -> String {
    format!(r#"claude mcp add --scope user {NAME} -- "{exe}" --mcp"#)
}

// ---- Codex -------------------------------------------------------------------------------------

fn codex_config() -> PathBuf {
    match std::env::var_os("CODEX_HOME") {
        Some(folder) => PathBuf::from(folder).join("config.toml"),
        None => home().join(".codex").join("config.toml"),
    }
}

/// The command of `[mcp_servers.interactive-learning]` in a `config.toml` of Codex.
pub fn codex_from_config(toml: &str) -> Option<String> {
    let headers = [
        format!("[mcp_servers.{NAME}]"),
        format!("[mcp_servers.\"{NAME}\"]"),
        format!("[mcp_servers.'{NAME}']"),
    ];
    let mut inside = false;
    for line in toml.lines().map(str::trim) {
        if line.starts_with('[') {
            inside = headers
                .iter()
                .any(|header| line.replace(' ', "") == *header);
            continue;
        }
        if !inside {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "command" {
            continue;
        }
        let value = value.trim();
        // A literal string ('...') as is; a basic string ("...") with its escapes.
        if let Some(text) = value
            .strip_prefix('\'')
            .and_then(|rest| rest.split_once('\''))
            .map(|(text, _)| text)
        {
            return Some(text.to_string());
        }
        if let Some(rest) = value.strip_prefix('"') {
            let mut out = String::new();
            let mut chars = rest.chars();
            while let Some(character) = chars.next() {
                match character {
                    '"' => return Some(out),
                    '\\' => match chars.next() {
                        Some('n') => out.push('\n'),
                        Some('t') => out.push('\t'),
                        Some(other) => out.push(other),
                        None => break,
                    },
                    other => out.push(other),
                }
            }
        }
        return None;
    }
    None
}

fn codex_read() -> Option<String> {
    std::fs::read_to_string(codex_config())
        .ok()
        .and_then(|text| codex_from_config(&text))
}

pub fn codex_command(exe: &str) -> String {
    format!(r#"codex mcp add {NAME} -- "{exe}" --mcp"#)
}

// ---- the skill ---------------------------------------------------------------------------------

fn skill_file(client: &str) -> Option<PathBuf> {
    let folder = match client {
        "claude" => ".claude",
        "codex" => ".agents",
        _ => return None,
    };
    Some(
        home()
            .join(folder)
            .join("skills")
            .join("interactive-learning")
            .join("SKILL.md"),
    )
}

fn skill_state(client: &str) -> Skill {
    let installed = skill_file(client).and_then(|file| std::fs::read_to_string(file).ok());
    match installed {
        None => Skill::Missing,
        Some(text) if text.replace("\r\n", "\n") == SKILL.replace("\r\n", "\n") => Skill::Current,
        Some(_) => Skill::Outdated,
    }
}

// ---- running the commands of agents ------------------------------------------------------------

/// A command of an agent, run without a console, answering on its output.
fn cli(
    program: &str,
    args: &[&str],
    folder: Option<&str>,
) -> std::io::Result<std::process::Output> {
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        // The command may be a `.cmd` from npm: `cmd /C` finds it in the PATH.
        let mut command = std::process::Command::new("cmd");
        command.arg("/C").arg(program).creation_flags(0x0800_0000);
        command
    };
    #[cfg(not(windows))]
    let mut command = std::process::Command::new(program);
    command.args(args).stdin(std::process::Stdio::null());
    if let Some(folder) = folder.filter(|folder| std::path::Path::new(folder).is_dir()) {
        command.current_dir(folder);
    }
    command.output()
}

fn outcome(output: std::io::Result<std::process::Output>, missing: &str) -> Result<(), String> {
    let output = output.map_err(|_| missing.to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let error = String::from_utf8_lossy(&output.stderr);
    let first = error
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(missing);
    Err(first.to_string())
}

// ---- commands ----------------------------------------------------------------------------------

/// Which agents know the studio, and how to connect the others.
#[tauri::command]
pub fn agents_status() -> Agents {
    let exe = exe();
    let (declared, local) = claude_read();
    let codex = codex_read();
    // Written by hand to keep the command before its arguments, as people read it.
    let json = format!(
        "{{\n  \"mcpServers\": {{\n    \"{NAME}\": {{\n      \"command\": {},\n      \"args\": [\"--mcp\"]\n    }}\n  }}\n}}",
        serde_json::to_string(&exe).unwrap_or_default()
    );
    Agents {
        claude: Client {
            connected: local.is_empty()
                && declared
                    .as_deref()
                    .is_some_and(|command| same_path(command, &exe)),
            declared,
            local,
            skill: skill_state("claude"),
        },
        codex: Client {
            connected: codex
                .as_deref()
                .is_some_and(|command| same_path(command, &exe)),
            declared: codex,
            local: Vec::new(),
            skill: skill_state("codex"),
        },
        claude_command: claude_command(&exe),
        codex_command: codex_command(&exe),
        json,
        name: NAME,
        tools: crate::mcp::tool_names(),
        exe,
    }
}

/// Declares this copy of the studio in Claude Code or Codex, for every project.
#[tauri::command]
pub async fn agents_connect(client: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let exe = exe();
        match client.as_str() {
            "claude" => {
                let (declared, local) = claude_read();
                for folder in &local {
                    let _ = cli(
                        "claude",
                        &["mcp", "remove", NAME, "-s", "local"],
                        Some(folder),
                    );
                }
                if declared.is_some() {
                    let _ = cli("claude", &["mcp", "remove", NAME, "-s", "user"], None);
                }
                outcome(
                    cli(
                        "claude",
                        &["mcp", "add", "--scope", "user", NAME, "--", &exe, "--mcp"],
                        None,
                    ),
                    "Claude Code is not installed on this computer (the claude command).",
                )
            }
            "codex" => {
                if codex_read().is_some() {
                    let _ = cli("codex", &["mcp", "remove", NAME], None);
                }
                outcome(
                    cli("codex", &["mcp", "add", NAME, "--", &exe, "--mcp"], None),
                    "Codex is not installed on this computer (the codex command).",
                )
            }
            other => Err(format!("Unknown agent {other}.")),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Installs the skill of this studio for Claude Code or Codex, or brings it up to date.
#[tauri::command]
pub fn agents_install_skill(client: String) -> Result<String, String> {
    let file = skill_file(&client).ok_or_else(|| format!("Unknown agent {client}."))?;
    crate::home::write_atomic(&file, SKILL.as_bytes())?;
    Ok(file.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_claude_code() {
        let exe = r"C:\Apps\interactive-learning-desktop.exe";
        let config = json!({
            "mcpServers": { "interactive-learning": { "command": exe, "args": ["--mcp"] }, "other": { "command": "x" } },
            "projects": {
                "C:/b": { "mcpServers": { "interactive-learning": { "command": exe } } },
                "C:/a": { "mcpServers": {} },
                "C:/c": {}
            }
        });
        let (global, local) = claude_from_config(&config);
        assert_eq!(global.as_deref(), Some(exe));
        assert_eq!(local, ["C:/b"]);
        assert!(same_path("c:/apps/INTERACTIVE-LEARNING-DESKTOP.exe", exe));
        assert_eq!(claude_from_config(&json!({})), (None, vec![]));
        assert_eq!(
            claude_command(exe),
            r#"claude mcp add --scope user interactive-learning -- "C:\Apps\interactive-learning-desktop.exe" --mcp"#
        );
    }

    #[test]
    fn reads_codex() {
        let toml = r#"model = "x"
[mcp_servers.magic]
command = "npx"

[mcp_servers.interactive-learning]
args = ["--mcp"]
command = 'C:\Apps\studio.exe'
[mcp_servers.interactive-learning.env]
command = "wrong"
"#;
        assert_eq!(
            codex_from_config(toml).as_deref(),
            Some(r"C:\Apps\studio.exe")
        );
        let toml =
            "[mcp_servers.\"interactive-learning\"]\ncommand = \"C:\\\\Apps\\\\studio.exe\"\n";
        assert_eq!(
            codex_from_config(toml).as_deref(),
            Some(r"C:\Apps\studio.exe")
        );
        assert_eq!(
            codex_from_config("[mcp_servers.magic]\ncommand = \"npx\"\n"),
            None
        );
    }

    #[test]
    fn carries_the_skill() {
        assert!(
            SKILL.starts_with("---\nname: interactive-learning")
                || SKILL.starts_with("---\r\nname: interactive-learning")
        );
        assert!(SKILL.contains("MCP"));
    }
}
