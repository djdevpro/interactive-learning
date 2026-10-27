//! Desktop studio: one window holds the studio interface and, beside it, the site being recorded.
//! The site runs in its own webview without any access to the studio commands.

mod devtools;
mod library;
mod selftest;

use serde::Serialize;
use serde_json::json;
use tauri::{
    ipc::{InvokeBody, Request},
    webview::{PageLoadEvent, WebviewBuilder},
    window::WindowBuilder,
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl,
};

pub(crate) const STUDIO: &str = "studio";
pub(crate) const SITE: &str = "site";

/// Tallest part of a page a capture keeps, in CSS pixels. A longer page keeps its top.
const MAX_PAGE_HEIGHT: f64 = 12_000.0;
/// WebP images stop at 16,383 pixels a side; a taller page is captured at a smaller scale.
const MAX_IMAGE_SIDE: f64 = 16_000.0;
/// Silences the observer while the studio scrolls the page itself for a capture.
const QUIET: &str = "window.__interactiveLearningQuiet = Infinity";
/// Wakes it once the page is back, after the scroll and the changes that this scroll sets off.
const AWAKE: &str = "window.__interactiveLearningQuiet = performance.now() + 400";
/// Read in the page at the moment of the capture, so the image, address and scroll match.
const PAGE_INFO: &str = "({ url: location.href, title: document.title, dpr: devicePixelRatio, \
    x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, \
    pageWidth: Math.max(document.documentElement.scrollWidth, innerWidth), \
    pageHeight: Math.max(document.documentElement.scrollHeight, \
        document.body ? document.body.scrollHeight : 0, innerHeight) })";

#[derive(Clone, Serialize)]
struct SitePage {
    url: String,
    loading: bool,
}

#[derive(Serialize)]
struct Size {
    width: f64,
    height: f64,
}

#[derive(Serialize)]
struct Area {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
struct Capture {
    /// The image: a file of the tutorial, such as `assets/3f2a....webp`, when the capture was
    /// saved in one, otherwise a data URI.
    src: String,
    /// Size of the image in pixels, when the capture was saved in a tutorial.
    image: Option<Size>,
    url: String,
    title: String,
    /// Size of the captured page, in CSS pixels.
    page: Size,
    /// Part of the page the window showed, in CSS pixels from the top left of the page.
    view: Area,
}

pub(crate) fn site(app: &AppHandle) -> Result<Webview, String> {
    app.get_webview(SITE)
        .ok_or_else(|| "The site view is not ready yet.".to_string())
}

/// Opens an address in the site view. An address without a scheme gets https.
#[tauri::command]
fn site_navigate(app: AppHandle, url: String) -> Result<String, String> {
    let text = url.trim();
    let full = if text.contains("://") {
        text.to_string()
    } else if text.starts_with("localhost") || text.starts_with("127.0.0.1") {
        format!("http://{text}")
    } else {
        format!("https://{text}")
    };
    let target = tauri::Url::parse(&full).map_err(|_| format!("{text} is not a web address."))?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("Only http and https addresses can be opened.".to_string());
    }
    site(&app)?
        .navigate(target.clone())
        .map_err(|error| error.to_string())?;
    Ok(target.to_string())
}

#[tauri::command]
fn site_history(app: AppHandle, action: String) -> Result<(), String> {
    let script = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        _ => return Err(format!("Unknown action {action}.")),
    };
    site(&app)?.eval(script).map_err(|error| error.to_string())
}

/// Places the site view over the frame that the interface leaves for it, in logical pixels.
/// A hidden view moves out of the window, since it always draws above the interface.
#[tauri::command]
fn site_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
) -> Result<(), String> {
    let view = site(&app)?;
    let position = if visible {
        LogicalPosition::new(x, y)
    } else {
        LogicalPosition::new(-20_000.0, -20_000.0)
    };
    view.set_position(position)
        .map_err(|error| error.to_string())?;
    view.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|error| error.to_string())
}

/// Screenshot of the site, read by its engine. `full_page` keeps the whole height of the page and
/// reports which part the window showed, so a guide can scroll like the person did; with a
/// `tutorial`, the image is saved in it. Without `full_page`, a quick picture of the window comes
/// back, which the studio shows while a full page is drawn.
#[tauri::command]
async fn site_capture(
    app: AppHandle,
    full_page: bool,
    tutorial: Option<String>,
) -> Result<Capture, String> {
    let mut shot = capture(&site(&app)?, full_page).await?;
    if let (true, Some(tutorial)) = (full_page, tutorial) {
        let data = shot.src.split_once(',').map(|(_, data)| data).unwrap_or("");
        let bytes = selftest::decode_base64(data)?;
        let (src, width, height) = library::save_capture(&app, &tutorial, &bytes)?;
        shot.src = src;
        shot.image = Some(Size {
            width: width.into(),
            height: height.into(),
        });
    }
    Ok(shot)
}

async fn capture(view: &Webview, full_page: bool) -> Result<Capture, String> {
    let info = devtools::evaluate(view, PAGE_INFO).await?;
    let read = |key: &str| info[key].as_f64().unwrap_or(0.0);
    let width = read("width").max(1.0);
    let height = read("height").max(1.0);
    let url = info["url"].as_str().unwrap_or_default().to_string();
    let title = info["title"].as_str().unwrap_or_default().to_string();
    if !full_page {
        let params = json!({ "format": "jpeg", "quality": 90, "optimizeForSpeed": true });
        return Ok(Capture {
            src: format!("data:image/jpeg;base64,{}", screenshot(view, params).await?),
            image: None,
            url,
            title,
            page: Size { width, height },
            view: Area {
                x: 0.0,
                y: 0.0,
                width,
                height,
            },
        });
    }
    let dpr = read("dpr").max(0.1);
    let page_width = read("pageWidth").max(width);
    let page_height = read("pageHeight").max(height).min(MAX_PAGE_HEIGHT);
    let scale = (MAX_IMAGE_SIDE / (page_height * dpr))
        .min(MAX_IMAGE_SIDE / (page_width * dpr))
        .min(1.0);
    let params = json!({
        "format": "webp", "quality": 85, "captureBeyondViewport": true,
        "clip": { "x": 0, "y": 0, "width": page_width, "height": page_height, "scale": scale },
    });
    let (x, y) = (read("x"), read("y"));
    // The engine draws the page with the window where it stands: a header that sticks to the top
    // of the window would land in the middle of the picture. From the top of the page, it stays
    // at the top, then the page goes back to where the person left it.
    let scrolled = x > 0.0 || y > 0.0;
    if scrolled {
        devtools::evaluate(
            view,
            &format!("{QUIET}, scrollTo({{ left: 0, top: 0, behavior: 'instant' }})"),
        )
        .await?;
    }
    let data = screenshot(view, params).await;
    if scrolled {
        devtools::evaluate(
            view,
            &format!("scrollTo({{ left: {x}, top: {y}, behavior: 'instant' }}), {AWAKE}"),
        )
        .await?;
    }
    let page = Size {
        width: page_width,
        height: page_height,
    };
    Ok(Capture {
        src: format!("data:image/webp;base64,{}", data?),
        image: None,
        url,
        title,
        view: Area {
            x: x.clamp(0.0, (page.width - width).max(0.0)),
            y: y.clamp(0.0, (page.height - height).max(0.0)),
            width: width.min(page.width),
            height: height.min(page.height),
        },
        page,
    })
}

async fn screenshot(view: &Webview, params: serde_json::Value) -> Result<String, String> {
    let shot: serde_json::Value = serde_json::from_str(
        &devtools::call(view, "Page.captureScreenshot", params.to_string()).await?,
    )
    .map_err(|error| error.to_string())?;
    shot["data"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "The screenshot came back empty.".to_string())
}

/// Writes the bytes of an exported archive. The path comes in a header, percent-encoded.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The file content is missing.".to_string());
    };
    let path = request
        .headers()
        .get("x-path")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .ok_or_else(|| "The destination is missing.".to_string())??;
    std::fs::write(&path, bytes).map_err(|error| format!("{path}: {error}"))
}

pub(crate) fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|error| error.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|error| error.to_string())?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("library", |context, request, responder| {
            let app = context.app_handle().clone();
            let label = context.webview_label().to_string();
            std::thread::spawn(move || responder.respond(library::serve(&app, &label, request)));
        })
        .invoke_handler(tauri::generate_handler![
            site_navigate,
            site_history,
            site_bounds,
            site_capture,
            write_file,
            library::library_root,
            library::library_scan,
            library::library_delete,
            library::library_reveal,
            library::site_save,
            library::theme_save,
            library::tutorial_create,
            library::tutorial_read,
            library::tutorial_write,
            library::tutorial_file,
            library::tutorial_move,
            library::tutorial_duplicate,
            library::tutorial_prune,
            library::tutorial_publish,
            library::tutorial_export
        ])
        .setup(|app| {
            let window = WindowBuilder::new(app, "main")
                .title("Interactive Learning Studio")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1000.0, 640.0)
                .build()?;
            let size = window
                .inner_size()?
                .to_logical::<f64>(window.scale_factor()?);
            let test_folder = std::env::var("IL_DESKTOP_SELFTEST").ok();
            // A self-test keeps its own library, away from the creator's tutorials.
            let root = match &test_folder {
                Some(folder) => std::path::PathBuf::from(folder).join("library"),
                None => library::default_root(app.handle()),
            };
            app.manage(library::Root(std::sync::Mutex::new(root)));
            // Both views share one profile; a self-test gets its own.
            let profile = |builder: WebviewBuilder<tauri::Wry>| match &test_folder {
                Some(folder) => builder.data_directory(format!("{folder}/profile").into()),
                None => builder,
            };
            window.add_child(
                profile(WebviewBuilder::new(
                    STUDIO,
                    WebviewUrl::App("index.html".into()),
                ))
                .auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                size,
            )?;
            let handle = app.handle().clone();
            let site = window.add_child(
                profile(WebviewBuilder::new(
                    SITE,
                    WebviewUrl::External("about:blank".parse()?),
                ))
                .on_page_load(move |_view, payload| {
                    let _ = handle.emit(
                        "site-page",
                        SitePage {
                            url: payload.url().to_string(),
                            loading: matches!(payload.event(), PageLoadEvent::Started),
                        },
                    );
                }),
                LogicalPosition::new(-20_000.0, -20_000.0),
                LogicalSize::new(1.0, 1.0),
            )?;
            devtools::observe(&site, app.handle().clone())?;
            if let Some(folder) = test_folder {
                selftest::run(app.handle().clone(), folder);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the studio could not start");
}
