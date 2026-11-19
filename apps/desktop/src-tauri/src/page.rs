//! What an AI agent does in the site view: read the page as a list of elements with refs, click
//! them for real, type demo data and press keys. The script lives in `page.js`. The clicks go
//! through the input system of the engine, so the observer records them like the creator's.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::engine::{self, Shot};
use crate::{site, STUDIO};

const SCRIPT: &str = include_str!("page.js");

/// Runs one function of the agent script, which installs itself first in a new page.
async fn agent(app: &AppHandle, call: &str) -> Result<Value, String> {
    let view = site(app)?;
    let reply = engine::evaluate(
        &view,
        &format!("{SCRIPT}\n;window.__interactiveLearningAgent.{call}"),
    )
    .await?;
    match reply["error"].as_str() {
        Some(error) => Err(error.to_string()),
        None => Ok(reply),
    }
}

fn literal(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

/// The page as an agent reads it: address, scroll, elements with their refs, and a picture of
/// what the window shows.
#[tauri::command]
pub async fn site_look(app: AppHandle, screenshot: bool) -> Result<Value, String> {
    let mut page = agent(&app, "look()").await?;
    if screenshot {
        page["image"] = json!(engine::screenshot(&site(&app)?, Shot::Still).await?);
    }
    Ok(page)
}

/// Brings an element into the window and gives the point to click.
#[tauri::command]
pub async fn site_target(app: AppHandle, target: String) -> Result<Value, String> {
    agent(&app, &format!("target({})", literal(&target))).await
}

/// A real click at a point of the window, in CSS pixels.
#[tauri::command]
pub async fn site_click(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    engine::click(&site(&app)?, x, y).await
}

#[tauri::command]
pub async fn site_type(
    app: AppHandle,
    target: String,
    text: String,
    submit: bool,
) -> Result<Value, String> {
    agent(
        &app,
        &format!("type({}, {}, {submit})", literal(&target), literal(&text)),
    )
    .await
}

/// A key of the keyboard. WebView2 gets a real one; elsewhere the script presses it.
#[tauri::command]
pub async fn site_key(app: AppHandle, key: String) -> Result<Value, String> {
    press(&app, &key).await
}

#[cfg(windows)]
async fn press(app: &AppHandle, key: &str) -> Result<Value, String> {
    engine::key(&site(app)?, key).await?;
    Ok(json!({ "pressed": key }))
}

#[cfg(not(windows))]
async fn press(app: &AppHandle, key: &str) -> Result<Value, String> {
    agent(app, &format!("key({})", literal(key))).await
}

#[tauri::command]
pub async fn site_scroll(
    app: AppHandle,
    target: Option<String>,
    to: Option<String>,
    by: Option<f64>,
) -> Result<Value, String> {
    let null = || "null".to_string();
    let target = target.as_deref().map(literal).unwrap_or_else(null);
    let to = to.as_deref().map(literal).unwrap_or_else(null);
    agent(
        &app,
        &format!("scroll({target}, {to}, {})", by.unwrap_or(0.0)),
    )
    .await
}

/// Where the page is now: address, title and scroll.
#[tauri::command]
pub async fn site_where(app: AppHandle) -> Result<Value, String> {
    agent(&app, "where()").await
}

/// A picture of the studio window, as the creator sees it, for an agent to check its work.
#[tauri::command]
pub async fn studio_snapshot(app: AppHandle) -> Result<String, String> {
    let view = app
        .get_webview(STUDIO)
        .ok_or_else(|| "The studio view is not ready yet.".to_string())?;
    engine::screenshot(&view, Shot::Still).await
}
