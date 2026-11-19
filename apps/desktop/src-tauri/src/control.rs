//! Where agents reach the running studio: a small HTTP server on 127.0.0.1, whose port and token
//! go to `~/.interactive-learning/studio.json` for the MCP server (`mcp.rs`). It answers only the
//! callers that show the token, from this computer and outside any browser.
//!
//! A tool call goes to the interface of the studio as an `agent-call` event. The interface carries
//! it out with the editor, so it shows in the window, is saved and can be undone, and answers with
//! `agent_reply`. Each change an agent makes joins a journal that Settings › MCP shows.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::mcp::{self, tool_error};
use crate::STUDIO;

pub const ADDRESS_FILE: &str = "studio.json";
const JOURNAL_FILE: &str = "activity.json";
const JOURNAL_LENGTH: usize = 200;
/// A long page or a slow site can take a while; an agent never waits forever.
const CALL_TIMEOUT: Duration = Duration::from_secs(240);
const MAX_BODY: usize = 16 * 1024 * 1024;

pub struct Control {
    port: u16,
    token: String,
    /// The interface listens for calls; a studio that just started needs a moment.
    ready: AtomicBool,
    next: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<Reply>>>,
    journal: Mutex<Vec<Activity>>,
}

/// The answer of the interface to a call.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    ok: bool,
    /// What the tool gives back to the agent.
    #[serde(default)]
    data: Value,
    /// Pictures for the agent, as data URIs.
    #[serde(default)]
    images: Vec<String>,
    #[serde(default)]
    error: String,
    /// A sentence of the catalog of the interface with its parameters, such as
    /// `{ "key": "activity.createdTutorial", "params": { "title": "Pay an invoice" } }`, which
    /// the journal shows in the language of the day.
    #[serde(default)]
    summary: Value,
    /// The tutorial the call worked on.
    #[serde(default)]
    tutorial: Option<String>,
}

/// One change an agent made, as the journal keeps it.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    at: String,
    agent: String,
    tool: String,
    ok: bool,
    /// The sentence of the catalog, or the error the agent got, as text.
    summary: Value,
    tutorial: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listening {
    port: u16,
    ready: bool,
}

/// The name an agent goes by in the journal and the library, from the name its client gives.
pub fn agent_name(client: &str) -> String {
    match client.trim() {
        "" => "AI agent".to_string(),
        "claude-code" => "Claude Code".to_string(),
        "claude-ai" => "Claude".to_string(),
        "codex" | "codex-mcp-client" | "codex_cli_rs" => "Codex".to_string(),
        "cursor-vscode" => "Cursor".to_string(),
        "Visual Studio Code" | "vscode" => "VS Code".to_string(),
        other => {
            let words = other.replace(['-', '_'], " ");
            let mut letters = words.chars();
            match letters.next() {
                Some(first) => first.to_uppercase().chain(letters).collect(),
                None => "AI agent".to_string(),
            }
        }
    }
}

/// 192 random bits, the secret an agent shows. The system never fails to give them in practice.
fn token() -> String {
    let mut bytes = [0u8; 24];
    if getrandom::fill(&mut bytes).is_err() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        bytes[..16].copy_from_slice(&nanos.to_le_bytes());
        bytes[16..20].copy_from_slice(&std::process::id().to_le_bytes());
    }
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn read_journal() -> Vec<Activity> {
    std::fs::read_to_string(crate::home::file(JOURNAL_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Opens the address and writes where it is. Agents find the studio from then on. The commands
/// of the interface work even when the address could not open.
pub fn start(app: &AppHandle) -> Result<(), String> {
    let opened = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string());
    let port = opened
        .as_ref()
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|address| address.port())
        .unwrap_or(0);
    let token = token();
    app.manage(Control {
        port,
        token: token.clone(),
        ready: AtomicBool::new(false),
        next: AtomicU64::new(1),
        pending: Mutex::new(HashMap::new()),
        journal: Mutex::new(read_journal()),
    });
    let listener = opened?;
    let address = json!({
        "port": port,
        "token": token,
        "pid": std::process::id(),
        "version": mcp::VERSION,
        "exe": std::env::current_exe().map(|exe| exe.to_string_lossy().to_string()).unwrap_or_default(),
    });
    let file = crate::home::file(ADDRESS_FILE);
    crate::home::write_atomic(&file, format!("{address:#}\n").as_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600));
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = handle.clone();
            std::thread::spawn(move || {
                let _ = serve(&app, stream);
            });
        }
    });
    Ok(())
}

/// Removes the address when the studio quits, unless another studio wrote its own since.
pub fn forget(app: &AppHandle) {
    let Some(control) = app.try_state::<Control>() else {
        return;
    };
    let file = crate::home::file(ADDRESS_FILE);
    let ours = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|address| address["port"] == control.port);
    if ours {
        let _ = std::fs::remove_file(file);
    }
}

fn respond(stream: &mut TcpStream, status: u16, body: &Value) -> std::io::Result<()> {
    let text = body.to_string();
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        text.len()
    )?;
    stream.write_all(text.as_bytes())?;
    stream.flush()
}

fn serve(app: &AppHandle, mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(30)))?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request = String::new();
    reader.read_line(&mut request)?;
    let mut parts = request.split_whitespace();
    let (method, path) = (
        parts.next().unwrap_or_default().to_string(),
        parts.next().unwrap_or_default().to_string(),
    );
    let mut headers = HashMap::new();
    for _ in 0..64 {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            break;
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    let control = app.state::<Control>();
    // A browser always says where a request comes from; the MCP server never does. No website
    // reaches the studio, even one that guessed the port.
    if headers.contains_key("origin") {
        return respond(
            &mut stream,
            403,
            &json!({ "error": "Browsers are not let in." }),
        );
    }
    let host = headers.get("host").map(String::as_str).unwrap_or_default();
    if host != format!("127.0.0.1:{}", control.port)
        && host != format!("localhost:{}", control.port)
    {
        return respond(&mut stream, 403, &json!({ "error": "Unknown host." }));
    }
    if headers.get("authorization") != Some(&format!("Bearer {}", control.token)) {
        return respond(&mut stream, 401, &json!({ "error": "Wrong token." }));
    }
    match (method.as_str(), path.as_str()) {
        ("GET", "/status") => respond(
            &mut stream,
            200,
            &json!({
                "ok": true,
                "version": mcp::VERSION,
                "pid": std::process::id(),
                "ready": control.ready.load(Ordering::SeqCst),
            }),
        ),
        ("POST", "/call") => {
            let length: usize = headers
                .get("content-length")
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            if length > MAX_BODY {
                return respond(&mut stream, 413, &json!({ "error": "Too large." }));
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body)?;
            let Ok(call) = serde_json::from_slice::<Value>(&body) else {
                return respond(&mut stream, 400, &json!({ "error": "Invalid JSON." }));
            };
            let result = run(
                app,
                call["name"].as_str().unwrap_or_default(),
                call.get("arguments").cloned().unwrap_or_else(|| json!({})),
                call["client"].as_str().unwrap_or_default(),
            );
            respond(&mut stream, 200, &result)
        }
        _ => respond(&mut stream, 404, &json!({ "error": "Nothing here." })),
    }
}

/// Runs a tool in the interface and waits for its answer.
fn run(app: &AppHandle, name: &str, arguments: Value, client: &str) -> Value {
    if !crate::home::settings().agents {
        return tool_error(
            "AI agents are turned off in this studio. The user can let them in from Settings › MCP.",
        );
    }
    let control = app.state::<Control>();
    for _ in 0..150 {
        if control.ready.load(Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    if !control.ready.load(Ordering::SeqCst) {
        return tool_error("The studio is still starting. Call the tool again in a moment.");
    }
    let id = control.next.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = channel();
    if let Ok(mut pending) = control.pending.lock() {
        pending.insert(id, sender);
    }
    let agent = agent_name(client);
    // The creator watches the agent make a tutorial: the window comes back from the taskbar.
    if matches!(name, "create_tutorial" | "open_tutorial") {
        if let Some(window) = app.get_window("main") {
            let _ = window.unminimize();
        }
    }
    let sent = app.emit_to(
        STUDIO,
        "agent-call",
        json!({ "id": id, "name": name, "arguments": arguments, "agent": agent }),
    );
    let reply = sent
        .ok()
        .and_then(|_| receiver.recv_timeout(CALL_TIMEOUT).ok());
    if let Ok(mut pending) = control.pending.lock() {
        pending.remove(&id);
    }
    let Some(reply) = reply else {
        return tool_error(
            "The studio did not answer in time. Look at its window, then call the tool again.",
        );
    };
    if !mcp::reads_only(name) {
        note(app, &control, &agent, name, &reply);
    }
    result_of(reply)
}

fn note(app: &AppHandle, control: &Control, agent: &str, tool: &str, reply: &Reply) {
    let entry = Activity {
        at: crate::library::now(),
        agent: agent.to_string(),
        tool: tool.to_string(),
        ok: reply.ok,
        summary: if reply.ok {
            reply.summary.clone()
        } else {
            Value::String(reply.error.clone())
        },
        tutorial: reply.tutorial.clone(),
    };
    let Ok(mut journal) = control.journal.lock() else {
        return;
    };
    journal.push(entry.clone());
    let excess = journal.len().saturating_sub(JOURNAL_LENGTH);
    journal.drain(..excess);
    if let Ok(text) = serde_json::to_string_pretty(&*journal) {
        let _ = crate::home::write_atomic(&crate::home::file(JOURNAL_FILE), text.as_bytes());
    }
    let _ = app.emit_to(STUDIO, "agent-activity", entry);
}

/// The MCP result of a reply: its data as text for the agent, then its pictures.
fn result_of(reply: Reply) -> Value {
    if !reply.ok {
        return tool_error(if reply.error.is_empty() {
            "The studio could not do it."
        } else {
            &reply.error
        });
    }
    let text = serde_json::to_string_pretty(&reply.data).unwrap_or_default();
    let mut content = vec![json!({ "type": "text", "text": text })];
    for image in &reply.images {
        if let Some((kind, data)) = image
            .strip_prefix("data:")
            .and_then(|rest| rest.split_once(";base64,"))
        {
            content.push(json!({ "type": "image", "data": data, "mimeType": kind }));
        }
    }
    json!({ "content": content, "isError": false })
}

/// The interface listens for calls from now on.
#[tauri::command]
pub fn agent_ready(control: State<'_, Control>) {
    control.ready.store(true, Ordering::SeqCst);
}

/// The answer of the interface to call `id`.
#[tauri::command]
pub fn agent_reply(control: State<'_, Control>, id: u64, reply: Reply) {
    let sender = control
        .pending
        .lock()
        .ok()
        .and_then(|mut pending| pending.remove(&id));
    if let Some(sender) = sender {
        let _ = sender.send(reply);
    }
}

/// What agents did, newest last.
#[tauri::command]
pub fn agent_activity(control: State<'_, Control>) -> Vec<Activity> {
    control
        .journal
        .lock()
        .map(|journal| journal.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn agent_listening(control: State<'_, Control>) -> Listening {
    Listening {
        port: control.port,
        ready: control.ready.load(Ordering::SeqCst),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_agents() {
        assert_eq!(agent_name("claude-code"), "Claude Code");
        assert_eq!(agent_name("codex-mcp-client"), "Codex");
        assert_eq!(agent_name("my-agent"), "My agent");
        assert_eq!(agent_name(""), "AI agent");
    }

    #[test]
    fn turns_replies_into_results() {
        let reply: Reply = serde_json::from_value(json!({
            "ok": true, "data": { "steps": 2 }, "images": ["data:image/jpeg;base64,AAAA", "not an image"],
            "summary": { "key": "activity.recordedStep", "params": { "number": 1, "title": "Pay" } }
        }))
        .unwrap();
        let result = result_of(reply);
        assert_eq!(result["isError"], false);
        assert!(result["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("\"steps\": 2"));
        assert_eq!(result["content"][1]["mimeType"], "image/jpeg");
        assert_eq!(result["content"][1]["data"], "AAAA");
        assert_eq!(result["content"].as_array().unwrap().len(), 2);
        let reply: Reply =
            serde_json::from_value(json!({ "ok": false, "error": "No tutorial is open." }))
                .unwrap();
        let result = result_of(reply);
        assert_eq!(result["isError"], true);
        assert_eq!(result["content"][0]["text"], "No tutorial is open.");
    }
}
