//! The DevTools protocol of the site view. On Windows the engine is WebView2, a Chromium, so the
//! studio reads screenshots, page metrics and observations straight from it.

use tauri::{AppHandle, Emitter, Webview};

/// Name of the function the observer calls in the page.
pub const BINDING: &str = "__interactiveLearning";
/// Script injected into every page of the site view.
pub const OBSERVER: &str = include_str!("observer.js");

/// Calls one DevTools method and returns its JSON result.
#[cfg(windows)]
pub async fn call(view: &Webview, method: &str, params: String) -> Result<String, String> {
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

#[cfg(not(windows))]
pub async fn call(_view: &Webview, _method: &str, _params: String) -> Result<String, String> {
    Err("The studio reads pages on Windows for now.".to_string())
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
#[cfg(windows)]
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
                            forward(&app, &take_pwstr(json));
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

#[cfg(not(windows))]
pub fn observe(_view: &Webview, _app: AppHandle) -> Result<(), String> {
    Ok(())
}

/// A binding call carries the report as a string; anything else on the channel is ignored.
fn forward(app: &AppHandle, event: &str) {
    let Ok(event) = serde_json::from_str::<serde_json::Value>(event) else {
        return;
    };
    if event["name"] != BINDING {
        return;
    }
    let Some(payload) = event["payload"].as_str() else {
        return;
    };
    if let Ok(report) = serde_json::from_str::<serde_json::Value>(payload) {
        let _ = app.emit("site-observation", report);
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
