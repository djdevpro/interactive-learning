//! WebKitGTK, read through its own API: snapshots of the page, scripts run in the page, and a
//! script message handler that carries the reports of the observer.

use super::{forward, Shot, BINDING, OBSERVER};
use gtk::gdk::{self, EventType, ModifierType};
use gtk::glib::translate::{ToGlibPtr, ToGlibPtrMut};
use gtk::prelude::*;
use javascriptcore::ValueExt;
use tauri::{AppHandle, Webview};
use webkit2gtk::{
    gio, glib, SnapshotOptions, SnapshotRegion, UserContentInjectedFrames, UserContentManagerExt,
    UserScript, UserScriptInjectionTime, WebView, WebViewExt,
};

/// Runs `task` with the view on the main thread of GTK and waits for the answer it gives `done`.
async fn on_view<T: Send + 'static>(
    view: &Webview,
    task: impl FnOnce(WebView, Box<dyn FnOnce(Result<T, String>)>) + Send + 'static,
) -> Result<T, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel::<Result<T, String>>();
    view.with_webview(move |platform| {
        let done = move |result| {
            let _ = sender.send(result);
        };
        task(platform.inner(), Box::new(done));
    })
    .map_err(|error| error.to_string())?;
    receiver
        .await
        .map_err(|_| "The engine did not answer.".to_string())?
}

/// Evaluates an expression in the page and returns its value as JSON.
pub async fn evaluate(view: &Webview, expression: &str) -> Result<serde_json::Value, String> {
    let script = expression.to_string();
    let json = on_view(view, move |webview, done| {
        let cancellable = None::<&gio::Cancellable>;
        webview.evaluate_javascript(&script, None, None, cancellable, move |result| {
            done(
                result
                    .map(|value| value.to_json(0).map(|json| json.to_string()))
                    .map_err(|error| format!("The page refused the script. {}", error.message())),
            )
        });
    })
    .await?;
    // A value that JSON cannot hold, such as `undefined`, comes back as null.
    json.map_or(Ok(serde_json::Value::Null), |json| {
        serde_json::from_str(&json).map_err(|error| error.to_string())
    })
}

/// Installs the observer in every next page and forwards each report to the studio as a
/// `site-observation` event. The page reaches nothing else of the studio.
pub fn observe(view: &Webview, app: AppHandle) -> Result<(), String> {
    view.with_webview(move |platform| {
        let Some(manager) = platform.inner().user_content_manager() else {
            return;
        };
        // A handler that replies has a signal of its own, which the IPC handler of wry does not
        // hear, so a report never reaches the commands of the studio. Without a world, it lives
        // in the world of the page, like the binding of WebView2.
        let registered = unsafe {
            webkit2gtk::ffi::webkit_user_content_manager_register_script_message_handler_with_reply(
                manager.to_glib_none().0,
                BINDING.to_glib_none().0,
                std::ptr::null(),
            )
        };
        if registered == glib::ffi::GFALSE {
            return;
        }
        let signal = format!("script-message-with-reply-received::{BINDING}");
        manager.connect_local(&signal, false, move |values| {
            receive(&app, values);
            Some(true.to_value())
        });
        // The observer reports through a function, as WebView2 gives it one.
        let bridge = format!(
            "window.{BINDING} = (report) => \
             window.webkit.messageHandlers.{BINDING}.postMessage(report);\n"
        );
        manager.add_script(&UserScript::new(
            &format!("{bridge}{OBSERVER}"),
            UserContentInjectedFrames::TopFrame,
            UserScriptInjectionTime::Start,
            &[],
            &[],
        ));
    })
    .map_err(|error| error.to_string())
}

/// Forwards a report of the observer, then answers the page, whose `postMessage` waits for the
/// studio.
fn receive(app: &AppHandle, values: &[glib::Value]) {
    let report = values
        .get(1)
        .and_then(|value| value.get::<javascriptcore::Value>().ok());
    let Some(report) = report else {
        return;
    };
    forward(app, &report.to_str());
    let (Some(reply), Some(context)) = (values.get(2), report.context()) else {
        return;
    };
    let nothing = javascriptcore::Value::new_undefined(&context);
    unsafe {
        let reply = glib::gobject_ffi::g_value_get_boxed(reply.to_glib_none().0)
            as *mut webkit2gtk::ffi::WebKitScriptMessageReply;
        if !reply.is_null() {
            webkit2gtk::ffi::webkit_script_message_reply_return_value(
                reply,
                nothing.to_glib_none().0,
            );
        }
    }
}

/// A real click, as GTK delivers the mouse to the view, at a point of the visible page in CSS
/// pixels.
pub async fn click(view: &Webview, x: f64, y: f64) -> Result<(), String> {
    on_view(view, move |webview, done| done(press(&webview, x, y))).await
}

fn press(webview: &WebView, x: f64, y: f64) -> Result<(), String> {
    let window = webview.window().ok_or("The site view is not on screen.")?;
    let pointer = window
        .display()
        .default_seat()
        .and_then(|seat| seat.pointer())
        .ok_or("The system has no pointer.")?;
    let (root_x, root_y) = window.root_coords(x as i32, y as i32);
    let time = (glib::monotonic_time() / 1000) as u32;
    let steps = [
        (EventType::MotionNotify, ModifierType::empty()),
        (EventType::ButtonPress, ModifierType::empty()),
        (EventType::ButtonRelease, ModifierType::BUTTON1_MASK),
    ];
    for (kind, state) in steps {
        let mut event = gdk::Event::new(kind);
        event.set_device(Some(&pointer));
        // The event holds a reference to its window, which GDK drops with the event.
        unsafe {
            let raw: *mut gdk::ffi::GdkEvent = event.to_glib_none_mut().0;
            if kind == EventType::MotionNotify {
                let motion = &mut (*raw).motion;
                motion.window = window.to_glib_full();
                motion.send_event = 1;
                motion.time = time;
                motion.x = x;
                motion.y = y;
                motion.x_root = root_x.into();
                motion.y_root = root_y.into();
                motion.state = state.bits();
            } else {
                let button = &mut (*raw).button;
                button.window = window.to_glib_full();
                button.send_event = 1;
                button.time = time;
                button.x = x;
                button.y = y;
                button.x_root = root_x.into();
                button.y_root = root_y.into();
                button.state = state.bits();
                button.button = 1;
            }
        }
        gtk::main_do_event(&mut event);
    }
    Ok(())
}

/// A snapshot drawn by the engine, encoded away from the main thread of GTK.
pub async fn screenshot(view: &Webview, shot: Shot) -> Result<String, String> {
    let region = match shot {
        Shot::Page { .. } => SnapshotRegion::FullDocument,
        Shot::Still | Shot::Png => SnapshotRegion::Visible,
    };
    let snapshot = on_view(view, move |webview, done| {
        let density = f64::from(webview.scale_factor());
        let cancellable = None::<&gio::Cancellable>;
        webview.snapshot(region, SnapshotOptions::NONE, cancellable, move |result| {
            done(
                result
                    .map_err(|error| error.to_string())
                    .and_then(|surface| Snapshot::copy(surface, density)),
            )
        });
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || snapshot.encode(shot))
        .await
        .map_err(|error| error.to_string())?
}

/// The pixels of a snapshot, copied for another thread. WebKitGTK draws `density` pixels per CSS
/// pixel, the scale of the screen.
struct Snapshot {
    pixels: Vec<u8>,
    format: cairo::Format,
    width: i32,
    height: i32,
    stride: i32,
    density: f64,
}

impl Snapshot {
    fn copy(surface: cairo::Surface, density: f64) -> Result<Self, String> {
        let image = cairo::ImageSurface::try_from(surface)
            .map_err(|_| "The snapshot is not an image.".to_string())?;
        let mut pixels = Vec::new();
        image
            .with_data(|data| pixels.extend_from_slice(data))
            .map_err(|error| error.to_string())?;
        Ok(Self {
            pixels,
            format: image.format(),
            width: image.width(),
            height: image.height(),
            stride: image.stride(),
            density,
        })
    }

    /// The snapshot as `shot` keeps it, on a white page, as a data URI.
    fn encode(self, shot: Shot) -> Result<String, String> {
        let (width, height, scale) = match shot {
            Shot::Page {
                width,
                height,
                scale,
            } => (
                (width * self.density * scale).round() as i32,
                (height * self.density * scale).round() as i32,
                scale,
            ),
            Shot::Still | Shot::Png => (self.width, self.height, 1.0),
        };
        let image = self.draw(width, height, scale)?;
        if matches!(shot, Shot::Png) {
            let mut png = Vec::new();
            image
                .write_to_png(&mut png)
                .map_err(|error| error.to_string())?;
            return Ok(data_uri("image/png", &png));
        }
        Ok(data_uri("image/webp", &webp(image)?))
    }

    /// Draws the snapshot at `scale` on a white page of `width` by `height` pixels, which crops
    /// what goes beyond, like the clip of a screenshot on Windows.
    fn draw(self, width: i32, height: i32, scale: f64) -> Result<cairo::ImageSurface, String> {
        let source = cairo::ImageSurface::create_for_data(
            self.pixels,
            self.format,
            self.width,
            self.height,
            self.stride,
        )
        .map_err(|error| error.to_string())?;
        let page = cairo::ImageSurface::create(cairo::Format::Rgb24, width.max(1), height.max(1))
            .map_err(|error| error.to_string())?;
        let context = cairo::Context::new(&page).map_err(|error| error.to_string())?;
        context.set_source_rgb(1.0, 1.0, 1.0);
        context.paint().map_err(|error| error.to_string())?;
        context.scale(scale, scale);
        context
            .set_source_surface(&source, 0.0, 0.0)
            .map_err(|error| error.to_string())?;
        context.source().set_filter(cairo::Filter::Good);
        context.paint().map_err(|error| error.to_string())?;
        Ok(page)
    }
}

/// Encodes a page in lossy WebP at quality 85, like WebView2 on Windows.
fn webp(mut image: cairo::ImageSurface) -> Result<Vec<u8>, String> {
    let (width, height) = (image.width() as usize, image.height() as usize);
    let stride = image.stride() as usize;
    let data = image.data().map_err(|error| error.to_string())?;
    let mut rgb = Vec::with_capacity(width * height * 3);
    // A pixel of an RGB24 surface is a native-endian 0x00RRGGBB word.
    for row in data.chunks_exact(stride).take(height) {
        for pixel in row[..width * 4].as_chunks::<4>().0 {
            let [_, red, green, blue] = u32::from_ne_bytes(*pixel).to_be_bytes();
            rgb.extend_from_slice(&[red, green, blue]);
        }
    }
    webp::Encoder::new(&rgb, webp::PixelLayout::Rgb, width as u32, height as u32)
        .encode_simple(false, 85.0)
        .map(|image| image.to_vec())
        .map_err(|error| format!("The screenshot could not be encoded. {error:?}"))
}

/// The bytes of an image as a data URI.
fn data_uri(kind: &str, bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut uri = format!("data:{kind};base64,");
    uri.reserve(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let group = chunk.iter().enumerate().fold(0u32, |group, (index, byte)| {
            group | (u32::from(*byte) << (16 - 8 * index))
        });
        for index in 0..4 {
            uri.push(if index <= chunk.len() {
                char::from(TABLE[((group >> (18 - 6 * index)) & 63) as usize])
            } else {
                '='
            });
        }
    }
    uri
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_data_uris() {
        assert_eq!(data_uri("text/plain", b""), "data:text/plain;base64,");
        assert_eq!(data_uri("text/plain", b"M"), "data:text/plain;base64,TQ==");
        assert_eq!(data_uri("text/plain", b"Ma"), "data:text/plain;base64,TWE=");
        assert_eq!(
            data_uri("text/plain", b"Man"),
            "data:text/plain;base64,TWFu"
        );
        let bytes: Vec<u8> = (0..=255).collect();
        let uri = data_uri("image/webp", &bytes);
        let data = uri.split_once(',').map(|(_, data)| data).unwrap_or("");
        assert_eq!(crate::selftest::decode_base64(data), Ok(bytes));
    }
}
