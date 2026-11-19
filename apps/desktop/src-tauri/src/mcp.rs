//! The MCP server of the studio. `interactive-learning-desktop --mcp` speaks the Model Context
//! Protocol (JSON-RPC 2.0, one message per line) on its standard input and output, without any
//! window. An AI agent such as Claude Code, Codex or Claude Desktop lists its tools and calls them.
//!
//! Each call goes to the studio running on this computer, which this process starts when it is
//! closed, through the local address in `~/.interactive-learning/studio.json` (see `control.rs`).
//! The call then happens in the window of the studio, where the creator watches and can take
//! over, and what it makes lands in the library like any tutorial.
//!
//! To declare it in Claude Code: `claude mcp add --scope user interactive-learning -- "<exe>" --mcp`

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::time::{Duration, Instant};

/// Name of the server in the configuration of agents, so its tools read
/// `mcp__interactive-learning__look`.
pub const NAME: &str = "interactive-learning";
/// Name the server gives itself in the handshake.
pub const SERVER: &str = "interactive-learning-studio";
pub const VERSION: &str = env!("IL_STUDIO_VERSION");
const PROTOCOLS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

/// The tools, shared with the interface of the studio, which carries them out.
const TOOLS: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/agent/tools.json"
));

pub fn tools() -> Vec<Value> {
    serde_json::from_str(TOOLS).unwrap_or_default()
}

pub fn tool_names() -> Vec<String> {
    tools()
        .iter()
        .filter_map(|tool| tool["name"].as_str().map(str::to_string))
        .collect()
}

/// A tool that only reads. The journal of the studio leaves these out.
pub fn reads_only(name: &str) -> bool {
    tools().iter().any(|tool| {
        tool["name"] == name && tool["annotations"]["readOnlyHint"].as_bool() == Some(true)
    })
}

/// What the client adds to the system prompt of the agent at connection: how to use the studio.
const INSTRUCTIONS: &str = "\
Interactive Learning Studio is the desktop app where the user keeps, records, edits and publishes interactive \
tutorials: walkthroughs of a web application made of real screenshots, an animated cursor and numbered markers. \
These tools drive the studio open on this computer, which starts if needed. Everything you do shows live in its \
window, is saved in the user's library (one folder per site, theme and tutorial) and can be undone there, so the \
user can follow along, take over, and come back to the tutorial later.

MAKE A TUTORIAL
1. `list_library`. Reuse the site whose address matches the application. Otherwise `create_site`, with \
`publish_to` set to the folder of the web project that serves tutorials (such as <project>/public/guides) when \
the user works in that project.
2. `create_tutorial`, with a short title that starts with a verb. Its editor opens on the site, in the browser of \
the studio.
3. `open_page` on the first page of the flow, then `start_recording`.
4. Repeat: `look` (a screenshot and the elements of the page, each with a ref), then act. While recording, each \
`click` becomes a step: the screen just before the click, the cursor and a marker named after what was clicked. \
`type_text` fills a field with demo data; the next click shows it filled. `capture_step` adds the page as it is, \
such as the result at the end, with an optional marker on an element.
5. `stop_recording`, `read_tutorial`, then write the texts: `update_step` (a title that starts with a verb and one \
sentence of text) and `update_marker` (a short name and what it does). Check a step with `show_step`, and \
`play_tutorial` lets the user watch it.
6. `publish_tutorial` when the site publishes to a project folder. Otherwise tell the user the tutorial waits in \
the studio, where they can publish or export it.

RULES
- Use demo data. Everything you do in the browser really happens in the application.
- Never change the page to get a nicer screenshot, and never invent a screen.
- A ref comes from the latest `look` of the current page: look again after each change of the page.
- One step per screen or action. Titles are short and start with a verb; details go in markers. A step plays \
2.5 to 4 seconds.
- Do not record logins with real credentials: ask the user to sign in, in the studio browser, before you record.
- Ask before publishing over a tutorial that is already published, and before deleting steps you did not make.
- End with a short report: the tutorial (site, theme, title), its steps, where it was published, and what you \
could not capture.";

const PROMPT_RECORD: &str = "\
Record a tutorial in Interactive Learning Studio that shows {flow}{site}.

Follow the workflow of the server instructions: `list_library`, reuse or create the site, `create_tutorial` with a \
title that starts with a verb, `open_page`, `start_recording`, then `look` and `click` through the flow, with demo \
data in the fields. Stop recording, write a clear title and one sentence for each step, name each marker, check \
the steps with `show_step`, and publish when the site has a project folder. End with a short report.";

const PROMPT_POLISH: &str = "\
Polish the tutorial {tutorial} in Interactive Learning Studio.

1. `list_library` to find it, then `open_tutorial` and `read_tutorial`.
2. For each step, check it with `show_step`: the marker sits on the right element, the title starts with a verb, \
the text says in one sentence what happens and why. Fix them with `update_step` and `update_marker`.
3. Remove steps that repeat the same screen with nothing new, after asking me. Give dense screens 3.5 to 4 seconds.
4. Ask me before publishing, then `publish_tutorial`. End with what you changed.";

fn prompts() -> Value {
    json!([
        {
            "name": "record_tutorial",
            "title": "Record a tutorial",
            "description": "Records a flow of a web application as a new tutorial in the studio, with its texts and markers.",
            "arguments": [
                { "name": "flow", "description": "What the tutorial shows, such as how to change the payment method", "required": true },
                { "name": "site", "description": "Name or address of the application (optional)", "required": false }
            ]
        },
        {
            "name": "polish_tutorial",
            "title": "Polish a tutorial",
            "description": "Reviews a tutorial of the library step by step and fixes its titles, texts, markers and timing.",
            "arguments": [
                { "name": "tutorial", "description": "Title or path of the tutorial", "required": true }
            ]
        }
    ])
}

fn argument<'a>(params: &'a Value, name: &str) -> Option<&'a str> {
    params["arguments"][name]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn get_prompt(params: &Value) -> Result<Value, (i64, String)> {
    let name = params["name"].as_str().unwrap_or_default();
    let text = match name {
        "record_tutorial" => PROMPT_RECORD
            .replace(
                "{flow}",
                argument(params, "flow").unwrap_or("the main flow"),
            )
            .replace(
                "{site}",
                &argument(params, "site")
                    .map(|site| format!(" on {site}"))
                    .unwrap_or_default(),
            ),
        "polish_tutorial" => PROMPT_POLISH.replace(
            "{tutorial}",
            &argument(params, "tutorial")
                .map(|tutorial| format!("“{tutorial}”"))
                .unwrap_or_else(|| "I name".to_string()),
        ),
        _ => return Err((-32602, format!("Unknown prompt: {name}"))),
    };
    Ok(json!({
        "description": name,
        "messages": [{ "role": "user", "content": { "type": "text", "text": text } }]
    }))
}

/// A tool result that says what went wrong, for the agent to fix and call again.
pub fn tool_error(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

/// What one connection knows: the name of its client, kept with what the agent makes.
#[derive(Default)]
pub struct Session {
    pub client: String,
}

/// Handles one JSON-RPC message and returns the reply, or nothing for a notification. `call` runs
/// a tool: the relay to the studio, or a stand-in in the tests.
pub fn handle_line(
    session: &mut Session,
    line: &str,
    call: &mut dyn FnMut(&str, &Value, &str) -> Value,
) -> Option<String> {
    // Some clients, such as PowerShell, start the stream with a UTF-8 byte order mark.
    let line = line.trim_start_matches('\u{feff}');
    let message: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(error) => {
            return Some(
                json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": format!("Invalid JSON: {error}") } })
                    .to_string(),
            )
        }
    };
    let id = message.get("id").cloned()?;
    let method = message["method"].as_str().unwrap_or_default();
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    let result = match method {
        "initialize" => {
            session.client = params["clientInfo"]["name"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            Ok(initialize(&params))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default();
            let arguments = match &params["arguments"] {
                Value::Null => json!({}),
                other => other.clone(),
            };
            Ok(if tool_names().iter().any(|tool| tool == name) {
                call(name, &arguments, &session.client)
            } else {
                tool_error(&format!("Unknown tool {name}."))
            })
        }
        "prompts/list" => Ok(json!({ "prompts": prompts() })),
        "prompts/get" => get_prompt(&params),
        _ => Err((-32601, format!("Unknown method: {method}"))),
    };
    Some(
        match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
            }
        }
        .to_string(),
    )
}

fn initialize(params: &Value) -> Value {
    let asked = params["protocolVersion"].as_str().unwrap_or(PROTOCOLS[0]);
    let version = if PROTOCOLS.contains(&asked) {
        asked
    } else {
        PROTOCOLS[0]
    };
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": { "listChanged": false }, "prompts": { "listChanged": false } },
        "serverInfo": { "name": SERVER, "title": "Interactive Learning Studio", "version": VERSION },
        "instructions": INSTRUCTIONS
    })
}

/// Reads standard input until it closes.
pub fn serve() -> i32 {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut session = Session::default();
    eprintln!("{SERVER} {VERSION} · MCP server");
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        if let Some(reply) = handle_line(&mut session, &line, &mut relay::call) {
            let _ = writeln!(stdout, "{reply}");
            let _ = stdout.flush();
        }
    }
    0
}

/// The way to the studio that runs on this computer.
pub mod relay {
    use super::*;

    /// Where the running studio listens, written by `control.rs` when it starts.
    #[derive(Deserialize)]
    pub struct Address {
        pub port: u16,
        pub token: String,
    }

    pub fn read() -> Option<Address> {
        let text = std::fs::read_to_string(crate::home::file(crate::control::ADDRESS_FILE)).ok()?;
        serde_json::from_str(&text).ok()
    }

    fn agent(timeout: Duration) -> ureq::Agent {
        ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .proxy(None)
            .build()
            .into()
    }

    fn answers(address: &Address) -> bool {
        agent(Duration::from_millis(1500))
            .get(format!("http://127.0.0.1:{}/status", address.port))
            .header("Authorization", format!("Bearer {}", address.token))
            .call()
            .is_ok_and(|response| response.status().as_u16() == 200)
    }

    /// Windows hands every inheritable handle to a new process, and the standard input and output
    /// that the agent gave this server are inheritable. Kept by the studio, they would stay open
    /// after this server quits, and the agent would wait for them forever.
    #[cfg(windows)]
    fn keep_own_handles() {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::Foundation::{
            SetHandleInformation, HANDLE, HANDLE_FLAGS, HANDLE_FLAG_INHERIT,
        };
        let handles = [
            std::io::stdin().as_raw_handle(),
            std::io::stdout().as_raw_handle(),
            std::io::stderr().as_raw_handle(),
        ];
        for handle in handles.into_iter().filter(|handle| !handle.is_null()) {
            // SAFETY: a handle of this process, which only loses its inheritable flag.
            unsafe {
                let _ =
                    SetHandleInformation(HANDLE(handle), HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0));
            }
        }
    }

    /// Starts the studio on its own, detached from this process and from the agent, so it stays
    /// open when the agent quits.
    fn launch() -> Result<(), String> {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        keep_own_handles();
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let mut command = Command::new(&exe);
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const DETACHED_PROCESS: u32 = 0x0000_0008;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            // The agent may hold its servers in a job that ends with it.
            const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
            command.creation_flags(
                DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB,
            );
            if command.spawn().is_ok() {
                return Ok(());
            }
            command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Interactive Learning Studio could not start: {error}"))
    }

    /// The running studio, started first when it is closed.
    pub fn connect() -> Result<Address, String> {
        if let Some(address) = read().filter(answers) {
            return Ok(address);
        }
        launch()?;
        let deadline = Instant::now() + Duration::from_secs(60);
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(300));
            if let Some(address) = read().filter(answers) {
                return Ok(address);
            }
        }
        Err(
            "Interactive Learning Studio did not start in time. Open it, then call the tool again."
                .to_string(),
        )
    }

    /// Runs a tool in the studio and returns its MCP result.
    pub fn call(name: &str, arguments: &Value, client: &str) -> Value {
        let address = match connect() {
            Ok(address) => address,
            Err(error) => return tool_error(&error),
        };
        let body = json!({ "name": name, "arguments": arguments, "client": client }).to_string();
        let reply = agent(Duration::from_secs(300))
            .post(format!("http://127.0.0.1:{}/call", address.port))
            .header("Authorization", format!("Bearer {}", address.token))
            .header("Content-Type", "application/json")
            .send(body);
        let mut response = match reply {
            Ok(response) => response,
            Err(error) => return tool_error(&format!("The studio did not answer: {error}")),
        };
        let text = response
            .body_mut()
            .with_config()
            .limit(128 * 1024 * 1024)
            .read_to_string()
            .unwrap_or_default();
        serde_json::from_str(&text)
            .unwrap_or_else(|_| tool_error(&format!("The studio answered: {}", text.trim())))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(session: &mut Session, message: Value) -> Value {
        let mut calls = |name: &str, arguments: &Value, client: &str| json!({ "content": [{ "type": "text", "text": format!("{name} {arguments} {client}") }] });
        handle_line(session, &message.to_string(), &mut calls)
            .map(|reply| serde_json::from_str(&reply).unwrap())
            .unwrap_or(Value::Null)
    }

    #[test]
    fn shakes_hands_and_lists_its_tools() {
        let mut session = Session::default();
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
                "protocolVersion": "2025-06-18", "clientInfo": { "name": "claude-code" } } }),
        );
        assert_eq!(reply["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(reply["result"]["serverInfo"]["name"], SERVER);
        assert!(reply["result"]["instructions"]
            .as_str()
            .unwrap()
            .contains("create_tutorial"));
        assert_eq!(session.client, "claude-code");
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 2, "method": "initialize", "params": { "protocolVersion": "1999-01-01" } }),
        );
        assert_eq!(reply["result"]["protocolVersion"], PROTOCOLS[0]);

        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/list" }),
        );
        let names: Vec<&str> = reply["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect();
        for name in [
            "list_library",
            "create_tutorial",
            "look",
            "click",
            "publish_tutorial",
        ] {
            assert!(names.contains(&name), "{name} is missing");
        }
        for tool in reply["result"]["tools"].as_array().unwrap() {
            assert_eq!(tool["inputSchema"]["type"], "object", "{}", tool["name"]);
            assert!(tool["description"]
                .as_str()
                .is_some_and(|text| text.len() > 20));
        }
        assert!(reads_only("look") && !reads_only("click"));
    }

    #[test]
    fn relays_known_tools_only() {
        let mut session = Session {
            client: "codex".to_string(),
        };
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "look" } }),
        );
        assert_eq!(reply["result"]["content"][0]["text"], "look {} codex");
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "format_disk" } }),
        );
        assert_eq!(reply["result"]["isError"], true);
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 6, "method": "nothing" }),
        );
        assert_eq!(reply["error"]["code"], -32601);
        // A notification gets no reply.
        assert_eq!(
            ask(
                &mut session,
                json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })
            ),
            Value::Null
        );
    }

    #[test]
    fn gives_its_prompts() {
        let mut session = Session::default();
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 7, "method": "prompts/get", "params": {
                "name": "record_tutorial", "arguments": { "flow": "how to pay an invoice", "site": "Billing" } } }),
        );
        let text = reply["result"]["messages"][0]["content"]["text"]
            .as_str()
            .unwrap();
        assert!(text.starts_with("Record a tutorial in Interactive Learning Studio that shows how to pay an invoice on Billing."));
        let reply = ask(
            &mut session,
            json!({ "jsonrpc": "2.0", "id": 8, "method": "prompts/get", "params": { "name": "x" } }),
        );
        assert_eq!(reply["error"]["code"], -32602);
    }
}
