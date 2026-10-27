//! `IL_DESKTOP_SELFTEST=<folder>` records a walkthrough without a person and checks every screen
//! of the studio. It creates a site, two themes and a tutorial in a library of its own, records
//! a test page (or `IL_DESKTOP_SELFTEST_URL`) with real scrolls and clicks, follows a link, stops,
//! edits a step, publishes, exports the ZIP, plays chosen moments of the tutorial and goes back to
//! the library, saving a PNG of each screen in that folder, then quits. Its profile and its
//! library live in that folder, away from real tutorials.

use std::io::Write;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::{devtools, SITE, STUDIO};

async fn pause(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

pub fn run(app: AppHandle, folder: String) {
    tauri::async_runtime::spawn(async move {
        let url = std::env::var("IL_DESKTOP_SELFTEST_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:4340/selftest/first.html".to_string());
        let published = format!("{folder}/published");
        let _ = std::fs::create_dir_all(&published);
        let mut report = Vec::new();
        // The studio says when it listens; a first launch may reload while Vite prepares.
        let (ready, listening) = tokio::sync::oneshot::channel::<()>();
        let ready = std::sync::Mutex::new(Some(ready));
        app.once("selftest-ready", move |_| {
            if let Some(ready) = ready.lock().ok().and_then(|mut slot| slot.take()) {
                let _ = ready.send(());
            }
        });
        let waited = tokio::time::timeout(Duration::from_secs(60), listening).await;
        report.push(format!("studio ready {}", waited.is_ok()));
        pause(2_000).await;
        // A site with two themes and a new tutorial, which opens in the browser, ready to record.
        let _ = app.emit(
            "selftest-library",
            serde_json::json!({ "address": url, "publishTo": published }),
        );
        pause(6_000).await;
        let _ = app.emit("selftest-record", ());
        pause(2_500).await;
        if let Some(site) = app.get_webview(SITE) {
            let installed = devtools::evaluate(
                &site,
                "typeof window.__interactiveLearning + ' ' + Boolean(window.__interactiveLearningObserver)",
            )
            .await;
            report.push(format!("observer {installed:?}"));
            let scrolled = devtools::evaluate(&site, "scrollTo(0, 700), scrollY").await;
            report.push(format!("scroll {scrolled:?}"));
            pause(1_500).await;
            report.push(format!("reveal {:?}", click_on(&site, "#reveal").await));
            pause(2_500).await;
            report.push(format!("next {:?}", click_on(&site, "#next").await));
            pause(4_000).await;
            report.push(format!("finish {:?}", click_on(&site, "#finish").await));
            pause(2_500).await;
        }
        report.push(save_view(&app, STUDIO, &format!("{folder}/recording.png")).await);
        let _ = app.emit("selftest-stop", ());
        pause(2_000).await;
        report.push(save_view(&app, SITE, &format!("{folder}/site.png")).await);
        let _ = app.emit("selftest-select", 1);
        pause(2_500).await;
        report.push(save_view(&app, STUDIO, &format!("{folder}/edit.png")).await);
        let _ = app.emit("selftest-publish", ());
        pause(1_500).await;
        let _ = app.emit("selftest-export", format!("{folder}/guide.zip"));
        pause(2_500).await;
        // Moments of the tutorial: the cursor of step 1, then step 2 fading in place, scrolling
        // and showing its marker, then step 3 fading to the next page.
        for (index, at) in [1_200, 3_250, 3_850, 6_700, 7_250].into_iter().enumerate() {
            let _ = app.emit("selftest-seek", at);
            pause(if index == 0 { 1_500 } else { 600 }).await;
            let path = format!("{folder}/preview-{}.png", index + 1);
            report.push(save_view(&app, STUDIO, &path).await);
        }
        // Stopping the player comes back to the view shown before it, with the address bar.
        let _ = app.emit("selftest-pause", ());
        pause(800).await;
        if let Some(studio) = app.get_webview(STUDIO) {
            let state = devtools::evaluate(
                &studio,
                "[document.querySelector('.view-switch [aria-pressed=true]')?.textContent?.trim(),                  Boolean(document.getElementById('address'))].join(' ')",
            )
            .await;
            report.push(format!("after play {state:?}"));
        }
        // The smallest window the studio allows, on the step editor.
        let _ = app.emit("selftest-select", 2);
        pause(1_500).await;
        if let Some(window) = app.get_window("main") {
            let _ = window.set_size(tauri::LogicalSize::new(1000.0, 640.0));
            pause(1_500).await;
            report.push(save_view(&app, STUDIO, &format!("{folder}/editor-small.png")).await);
            let _ = window.set_size(tauri::LogicalSize::new(1440.0, 900.0));
            pause(1_000).await;
        }
        let _ = app.emit("selftest-library-view", ());
        pause(2_500).await;
        report.push(save_view(&app, STUDIO, &format!("{folder}/library.png")).await);
        let tutorial = format!("{folder}/library/Demo workspace/Billing/change-the-payment-method");
        report.push(format!(
            "files guide {} published {} zip {}",
            std::path::Path::new(&format!("{tutorial}/guide.json")).exists(),
            std::path::Path::new(&format!("{published}/change-the-payment-method/guide.json"))
                .exists(),
            std::path::Path::new(&format!("{folder}/guide.zip")).exists(),
        ));
        // The terminal that started the test may be gone: the report goes to a file too, and a
        // closed output never keeps the studio open.
        let line = format!("SELFTEST {}", report.join(" | "));
        let _ = std::fs::write(format!("{folder}/report.txt"), &line);
        let _ = writeln!(std::io::stdout(), "{line}");
        app.exit(0);
    });
}

/// Scrolls an element into the middle of the window, then clicks its center.
async fn click_on(site: &tauri::Webview, selector: &str) -> Result<(), String> {
    let center = devtools::evaluate(
        site,
        &format!(
            "(() => {{ const element = document.querySelector({selector:?}); if (!element) return null; \
             element.scrollIntoView({{ block: 'center' }}); const box = element.getBoundingClientRect(); \
             return {{ x: box.x + box.width / 2, y: box.y + box.height / 2 }}; }})()"
        ),
    )
    .await?;
    let (Some(x), Some(y)) = (center["x"].as_f64(), center["y"].as_f64()) else {
        return Err(format!("{selector} is not in the page"));
    };
    pause(800).await;
    devtools::click(site, x, y).await
}

async fn save_view(app: &AppHandle, label: &str, path: &str) -> String {
    let result = match app.get_webview(label) {
        Some(view) => devtools::call(
            &view,
            "Page.captureScreenshot",
            r#"{"format":"png"}"#.to_string(),
        )
        .await
        .and_then(|json| {
            serde_json::from_str::<serde_json::Value>(&json)
                .map_err(|error| error.to_string())
                .and_then(|value| {
                    value["data"]
                        .as_str()
                        .map(str::to_string)
                        .ok_or_else(|| "empty screenshot".to_string())
                })
        }),
        None => Err("missing view".to_string()),
    };
    let saved = result.and_then(|data| {
        decode_base64(&data)
            .and_then(|bytes| std::fs::write(path, bytes).map_err(|error| error.to_string()))
    });
    match saved {
        Ok(()) => format!("{label} saved"),
        Err(error) => format!("{label} failed: {error}"),
    }
}

pub(crate) fn decode_base64(text: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut values = [255u8; 256];
    for (index, byte) in TABLE.iter().enumerate() {
        values[*byte as usize] = index as u8;
    }
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0;
    for byte in text.bytes().filter(|byte| *byte != b'=') {
        let value = values[byte as usize];
        if value == 255 {
            return Err("Invalid base64.".to_string());
        }
        buffer = (buffer << 6) | value as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Ok(out)
}
