// No console window next to the studio in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    interactive_learning_desktop_lib::run()
}
