# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tutorial creators who are not developers: trainers, support and onboarding teams who document the web applications their own users work in. They record a flow, polish it, and hand it over. They never meet JSON, CSS, viewports or file formats in the interface; the words they use are sites, themes, tutorials, steps, screens and markers.

## Product Purpose

Interactive Learning Studio is the desktop software where creators keep, record, edit and publish interactive tutorials. A tutorial is a walk through a website made of real screenshots, an animated cursor and numbered markers, played by the `<interactive-learning>` player inside the web application. The studio holds a library of sites, themes and tutorials, and edits one tutorial at a time like a small video editor made for tutorials. Success: a creator records a flow in one pass, polishes it on a timeline, and publishes it without help from a developer.

## Positioning

The browser lives inside the editor. Recording happens in the studio itself: every click becomes a step with the screen just before it, the clicked point and a marker named after what was clicked. Screenshots keep the whole height of the page and the part that was on screen, so the player replays scrolls, fades and cursor travel the way the creator moved. Tutorials stay plain folders that every Interactive Learning tool opens: the CLI, the AI skill, the browser extension and the web studio.

## Operating Context

- The library is a folder on disk: `Documents/Interactive Learning`, then one folder per site, one per theme inside it, and one per tutorial inside a theme. Each tutorial folder holds `guide.json` and its images, so it can be backed up, shared and versioned like any file.
- A site can be linked to the folder of its web project, for example `public/guides`, so that publishing writes the tutorial where the web application serves it. Export ZIP stays available for the extension, the web studio or a developer.
- A site holds several tutorials, grouped by theme or category.
- An AI agent can prepare a tutorial with the skill; the creator then refines it in a studio.
- A desktop window on Windows, used with a mouse and a keyboard during long working sessions.

## Capabilities and Constraints

- Automatic recording: a click becomes a step with the screen before the click, the cursor and a named marker. Full-page screenshots keep the part shown on screen. A manual capture adds the page as it is.
- Step editing: markers (add, move, delete, their texts), title, duration, transition between screens (fade or cut), the part of the page shown on screen, page address, retake of the screenshot.
- Preview in the player, publish to the linked project folder, export ZIP.
- The guide format (schema 1.0.0, `packages/protocol`) is shared with every other package; new fields stay optional so older players keep working.
- Screenshots come straight from the engine of the site view, WebView2 on Windows and WebKitGTK on Linux, so recording needs no browser permission.
- Interface copy is in English, like the other surfaces of the project.
- Undecided: accounts, cloud sync, collaboration, voice-over, video export.

## Brand Commitments

- The name Interactive Learning and its logo, the app icon (`src-tauri/icons`, drawn from `apps/extension/assets/icon.svg`): three white bars on green `#1c6651`. Buttons, selection and focus take the greens of the logo, as the extension already does.
- The studio follows the conventions of video editing software, played straight: a dark interface, panels around a central viewer, properties on the right, tracks on a timeline at the bottom. Camtasia is the reference for its craft and its habits, as the creator chose.

## Evidence on Hand

- Real guides and screenshots in `examples/` and `apps/example`.
- No testimonials, customers or usage figures exist; never invent any.

## Product Principles

1. Record once, polish later: recording never interrupts the creator, and everything it captured stays editable.
2. Plain words for non-developers: the interface talks about sites, themes, tutorials, steps, screens and markers, never about files, formats or code.
3. The creator owns the files: the library is a folder of standard tutorials that any Interactive Learning tool opens.
4. What you edit is what viewers get: the editor shows the tutorial the way the player will play it.
5. Software-grade work: keyboard shortcuts, autosave and no lost work.

## Accessibility & Inclusion

Operable with the keyboard, with visible focus. Animations follow the reduced motion preference, as the player already does.
