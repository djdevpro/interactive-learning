//! On Linux, Tauri packs the webviews of a window in a GTK box, one under the other, and moves
//! or sizes none of them. An overlay puts them back as on Windows: the studio view fills the
//! window and the site view stands over the slot the studio leaves for it.

use gtk::prelude::*;
use std::cell::Cell;
use tauri::Webview;

thread_local! {
    /// Where the site view stands, in logical pixels from the top left of the window. GTK reads
    /// it on its main thread each time it lays the window out.
    static SLOT: Cell<(i32, i32, i32, i32)> = const { Cell::new((-20_000, -20_000, 1, 1)) };
}

/// Moves the studio view and the site view from the box of the window into an overlay, where the
/// studio view fills the window and the site view stands where `place` puts it.
pub fn stack(site: &Webview) -> Result<(), String> {
    site.with_webview(|platform| {
        let site = platform.inner();
        let Some(column) = site
            .parent()
            .and_then(|parent| parent.downcast::<gtk::Box>().ok())
        else {
            return;
        };
        let studio = column.children().into_iter().find(|child| {
            child != site.upcast_ref::<gtk::Widget>() && child.is::<webkit2gtk::WebView>()
        });
        let Some(studio) = studio else {
            return;
        };
        let overlay = gtk::Overlay::new();
        column.remove(&studio);
        column.remove(&site);
        overlay.add(&studio);
        overlay.add_overlay(&site);
        overlay.connect_get_child_position(|_, _| {
            let (x, y, width, height) = SLOT.get();
            Some(gtk::gdk::Rectangle::new(x, y, width, height))
        });
        column.pack_start(&overlay, true, true, 0);
        overlay.show_all();
    })
    .map_err(|error| error.to_string())
}

/// Puts the site view over a part of the window, in logical pixels.
pub fn place(site: &Webview, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let slot = (
        x.round() as i32,
        y.round() as i32,
        width.round() as i32,
        height.round() as i32,
    );
    site.with_webview(move |platform| {
        SLOT.set(slot);
        platform.inner().queue_resize();
    })
    .map_err(|error| error.to_string())
}
