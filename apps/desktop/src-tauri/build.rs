fn main() {
    // The version of the studio, from tauri.conf.json, which the release workflow sets. The MCP
    // server gives it too, and it runs without Tauri.
    let config = std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json");
    let version = config
        .split("\"version\"")
        .nth(1)
        .and_then(|rest| rest.split('"').nth(1))
        .unwrap_or("0.0.0");
    println!("cargo:rustc-env=IL_STUDIO_VERSION={version}");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
