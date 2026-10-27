//! WebView2, a Chromium, read through its DevTools protocol.

use super::{forward, Shot, BINDING, OBSERVER};
use tauri::{AppHandle, Webview};

/// Calls one DevTools method and returns its JSON result.
async fn call(view: &Webview, method: &str, params: String) -> Result<String, String> {
    use std::sync::{Arc, Mutex};
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::{HSTRING, PCWSTR};

    let (sender, receiver) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let reply = move |result: Result<String, String>| {
        if let Some(sender) = sender.lock().ok().and_then(|mut slot| slot.take()) {
            let _ = sender.send(result);
        }
    };
    let method = HSTRING::from(method);
    let params = HSTRING::from(params);
    view.with_webview(move |platform| {
        let done = reply.clone();
        let call = || -> windows::core::Result<()> {
            unsafe {
                let core = platform.controller().CoreWebView2()?;
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |status, json| {
                        done(status.map(|_| json).map_err(|error| error.message()));
                        Ok(())
                    },
                ));
                core.CallDevToolsProtocolMethod(
                    PCWSTR(method.as_ptr()),
                    PCWSTR(params.as_ptr()),
                    &handler,
                )
            }
        };
        if let Err(error) = call() {
            reply(Err(error.message()));
        }
    })
    .map_err(|error| error.to_string())?;
    receiver
        .await
        .map_err(|_| "The engine did not answer.".to_string())?
}

/// Evaluates an expression in the page and returns its value as JSON.
pub async fn evaluate(view: &Webview, expression: &str) -> Result<serde_json::Value, String> {
    let params = serde_json::json!({ "expression": expression, "returnByValue": true });
    let reply: serde_json::Value =
        serde_json::from_str(&call(view, "Runtime.evaluate", params.to_string()).await?)
            .map_err(|error| error.to_string())?;
    if let Some(error) = reply.get("exceptionDetails") {
        return Err(format!("The page refused the script. {error}"));
    }
    Ok(reply["result"]["value"].clone())
}

/// Installs the observer in the current page and every next one, and forwards each report to the
/// studio as a `site-observation` event. The page reaches nothing else of the studio.
pub fn observe(view: &Webview, app: AppHandle) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use webview2_com::{
        take_pwstr, CallDevToolsProtocolMethodCompletedHandler,
        DevToolsProtocolEventReceivedEventHandler,
    };
    use windows::core::{HSTRING, PCWSTR, PWSTR};

    unsafe fn fire(core: &ICoreWebView2, method: &str, params: &str) {
        let method = HSTRING::from(method);
        let params = HSTRING::from(params);
        let ignore = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
        let _ = core.CallDevToolsProtocolMethod(
            PCWSTR(method.as_ptr()),
            PCWSTR(params.as_ptr()),
            &ignore,
        );
    }

    view.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else {
            return;
        };
        let event = HSTRING::from("Runtime.bindingCalled");
        if let Ok(receiver) = core.GetDevToolsProtocolEventReceiver(PCWSTR(event.as_ptr())) {
            let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(
                move |_sender, args| {
                    if let Some(args) = args {
                        let mut json = PWSTR::null();
                        if args.ParameterObjectAsJson(&mut json).is_ok() {
                            report(&app, &take_pwstr(json));
                        }
                    }
                    Ok(())
                },
            ));
            let mut token = 0i64;
            let _ = receiver.add_DevToolsProtocolEventReceived(&handler, &mut token);
            // The subscription lives as long as its receiver, which must last as long as the view.
            std::mem::forget(receiver);
        }
        let observer = serde_json::json!({ "source": OBSERVER }).to_string();
        fire(&core, "Page.enable", "{}");
        fire(&core, "Runtime.enable", "{}");
        fire(
            &core,
            "Runtime.addBinding",
            &format!(r#"{{"name":"{BINDING}"}}"#),
        );
        fire(&core, "Page.addScriptToEvaluateOnNewDocument", &observer);
        fire(
            &core,
            "Runtime.evaluate",
            &serde_json::json!({ "expression": OBSERVER }).to_string(),
        );
    })
    .map_err(|error| error.to_string())
}

/// A binding call carries the report as a string; anything else on the channel is ignored.
fn report(app: &AppHandle, event: &str) {
    let Ok(event) = serde_json::from_str::<serde_json::Value>(event) else {
        return;
    };
    if event["name"] != BINDING {
        return;
    }
    if let Some(payload) = event["payload"].as_str() {
        forward(app, payload);
    }
}

/// A real click, as the input system delivers it, at a point of the visible page in CSS pixels.
pub async fn click(view: &Webview, x: f64, y: f64) -> Result<(), String> {
    for kind in ["mouseMoved", "mousePressed", "mouseReleased"] {
        let params = serde_json::json!({
            "type": kind, "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": 1,
        });
        call(view, "Input.dispatchMouseEvent", params.to_string()).await?;
    }
    Ok(())
}

/// A screenshot drawn by the engine, which keeps a page beyond the window by itself.
pub async fn screenshot(view: &Webview, shot: Shot) -> Result<String, String> {
    let (format, params) = match shot {
        Shot::Still => (
            "jpeg",
            serde_json::json!({ "format": "jpeg", "quality": 90, "optimizeForSpeed": true }),
        ),
        Shot::Page {
            width,
            height,
            scale,
        } => (
            "webp",
            serde_json::json!({
                "format": "webp", "quality": 85, "captureBeyondViewport": true,
                "clip": { "x": 0, "y": 0, "width": width, "height": height, "scale": scale },
            }),
        ),
        Shot::Png => ("png", serde_json::json!({ "format": "png" })),
    };
    let reply: serde_json::Value =
        serde_json::from_str(&call(view, "Page.captureScreenshot", params.to_string()).await?)
            .map_err(|error| error.to_string())?;
    let data = reply["data"]
        .as_str()
        .ok_or_else(|| "The screenshot came back empty.".to_string())?;
    Ok(format!("data:image/{format};base64,{data}"))
}
