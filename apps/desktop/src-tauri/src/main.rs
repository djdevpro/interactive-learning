// No console window next to the studio in release builds on Windows. With `--mcp`, the program
// still reads and writes the standard input and output its MCP client gives it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|argument| argument == "--mcp") {
        std::process::exit(interactive_learning_desktop_lib::mcp_server());
    }
    interactive_learning_desktop_lib::run()
}
