# Interactive Learning Studio

The desktop app of Interactive Learning for tutorial creators, on Windows and Linux, built with Tauri 2 and Rust. It keeps a library of sites, themes and tutorials on disk, records a site in its built-in browser, and edits each tutorial like a video editor, with the steps on a timeline, the selected step on a canvas and its properties on the side. A tutorial plays in the `<interactive-learning>` player and publishes to the web project or as a ZIP.

## Download

The [releases of the repository](https://github.com/djdevpro/interactive-learning/releases) hold the Windows installer and the Linux packages. The Windows installer is not signed yet, so Windows may say its publisher is unknown. Choose More info, then Run anyway. On Linux, make the AppImage executable and open it, or install the `.deb` or `.rpm` package.

## Run it

It needs Rust and, on Windows, the Microsoft C++ build tools and WebView2, which Windows 10 and 11 already include. Linux needs WebKitGTK 2.40 or later and the other libraries listed in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Run these commands from the repository root.

```sh
pnpm install
pnpm dev:desktop
```

`pnpm --filter @interactive-learning/desktop build` produces the installers in `src-tauri/target/release/bundle`.

## Release

`pnpm release:desktop` runs the Release desktop studio workflow on GitHub. It builds the Windows installer and the Linux packages, then publishes them together as the `desktop-v<version>` release. Raise `version` in `src-tauri/tauri.conf.json` before each release, since the workflow never replaces a published version.

## The library

The library is a folder, `Documents/Interactive Learning`. Each site is a folder, each theme a folder inside it, and each tutorial a folder inside a theme, holding `guide.json` and its images in `assets/`. The CLI, the AI skill, the browser extension and the web studio open these folders too.

- **New site** asks for its name, its address, and optionally the folder of its web project where tutorials are published, such as `public/guides`.
- Themes group the tutorials of a site and carry a label color, like clips in a video editor.
- A tutorial can be renamed, duplicated, moved to another theme, shown in the file manager, or deleted to the recycle bin of Windows or the trash of Linux.
- Each tutorial shows whether it is a draft, published, or changed since it was published.

## The editor

- **Record**, at the top left, opens the site in the browser of the studio. While recording, the page is captured each time it settles after something you did, and each click becomes a step with the screen before the click, scrolled as you saw it, the cursor and a marker named after what you clicked. **Capture** adds the page as it is.
- The bar above the viewer stays in every view. **Site** shows the browser and **Step** the selected step, next to the address of the page.
- **Steps** on the left lists the tutorial in order. Alt+↑ and Alt+↓ move the selected step.
- The canvas shows the selected step. Click to add a marker, drag a marker to move it, and on a full-page screenshot drag the **On screen** frame to choose what the viewer sees.
- **Properties** on the right edits the title and text of the step, how long it plays, whether it fades or cuts in, its page address, its markers, and retakes its screenshot.
- The timeline has a **Steps** track, where a step is as long as it plays, and a **Markers** track. Drag a clip to move a step, drag its right edge to change its time, click the joint between two steps to fade or cut. The ruler moves the playhead.
- **Play** plays the tutorial in the player from the playhead. A pause returns to the view you left, on the step under the playhead.
- Every change is saved on its own. **Undo** and **Redo** walk back through the changes of the session.
- **Publish** copies the tutorial into the project folder of its site. **Export** writes a ZIP.

On the keyboard, Space plays or pauses, ← and → change the step, Delete removes the selected marker or step, Ctrl+Z and Ctrl+Y undo and redo, Ctrl+D duplicates a step, Ctrl+R records, and Esc leaves the player or the browser.

## How it works

- The window holds two webviews. The studio interface fills the window, and the site view sits over the part the interface leaves for it. On Linux a GTK overlay holds them, since Tauri would stack them one under the other. The site view has no access to the studio commands, and the files of the library reach only the studio view, through its own `library` address.
- Screenshots come straight from the engine of the site view, through the DevTools protocol of WebView2 on Windows and the snapshot API of WebKitGTK on Linux, so the image matches the page pixel for pixel without any browser permission. A script in every page reports clicks, scrolls and changes through a DevTools binding on Windows and a script message handler on Linux. It only listens. It never blocks, changes or replays anything in the page, and never reads the values of fields.
- To draw a whole page, the engine shows it from its top for a moment, which would flash in the window. A still picture of the window takes the place of the site view meanwhile, and the page goes back to where you left it, so nothing moves on screen. Drawn from its top, a header that sticks to the top of the window stays at the top of the picture.
- Screenshots are named after their content, so the same screen captured twice is one file.

## Self-test

`IL_DESKTOP_SELFTEST=<folder> pnpm exec tauri dev --no-watch` creates a site, two themes and a tutorial in a library of its own in that folder, records a test page served with the studio (or `IL_DESKTOP_SELFTEST_URL`) with real scrolls and clicks, edits a step, publishes, exports the ZIP, plays chosen moments of the tutorial, opens the editor at the smallest window size and goes back to the library. It saves a PNG of each screen and a `report.txt` in that folder, then quits. Its profile lives there too, away from your tutorials. On Linux without a screen, start the command with `xvfb-run -a`.
