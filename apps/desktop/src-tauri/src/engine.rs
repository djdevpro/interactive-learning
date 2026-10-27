//! The engine of the site view, which the studio reads straight, so a screenshot matches the page
//! pixel for pixel without any browser permission: WebView2 on Windows through its DevTools
//! protocol, and WebKitGTK on Linux through its own API.
#![cfg_attr(not(any(windows, target_os = "linux")), allow(dead_code))]

use tauri::{AppHandle, Emitter};

#[cfg(windows)]
mod devtools;
#[cfg(windows)]
pub use devtools::{click, evaluate, observe, screenshot};

#[cfg(target_os = "linux")]
mod webkit;
#[cfg(target_os = "linux")]
pub use webkit::{click, evaluate, observe, screenshot};

#[cfg(not(any(windows, target_os = "linux")))]
pub use elsewhere::{click, evaluate, observe, screenshot};

/// Name of the function the observer calls in the page.
const BINDING: &str = "__interactiveLearning";
/// Script injected into every page of the site view.
const OBSERVER: &str = include_str!("observer.js");

/// What a screenshot shows. It comes back as a data URI.
#[derive(Clone, Copy)]
pub enum Shot {
    /// The window as it shows, quick to draw, to stand in for the view while a page is drawn.
    Still,
    /// The page from its top left, `width` by `height` CSS pixels at `scale` times the pixels of
    /// the screen, in WebP.
    Page { width: f64, height: f64, scale: f64 },
    /// The window in PNG, for the self-test.
    Png,
}

/// Sends a report of the observer to the studio as a `site-observation` event.
fn forward(app: &AppHandle, report: &str) {
    if let Ok(report) = serde_json::from_str::<serde_json::Value>(report) {
        let _ = app.emit("site-observation", report);
    }
}

/// Other systems give the studio no engine to read.
#[cfg(not(any(windows, target_os = "linux")))]
mod elsewhere {
    use super::Shot;
    use tauri::{AppHandle, Webview};

    const UNSUPPORTED: &str = "The studio reads pages on Windows and Linux.";

    pub async fn evaluate(_view: &Webview, _expression: &str) -> Result<serde_json::Value, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn observe(_view: &Webview, _app: AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub async fn click(_view: &Webview, _x: f64, _y: f64) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub async fn screenshot(_view: &Webview, _shot: Shot) -> Result<String, String> {
        Err(UNSUPPORTED.to_string())
    }
}
