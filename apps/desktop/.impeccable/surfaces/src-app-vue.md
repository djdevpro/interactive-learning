---
version: 1
slug: 'src-app-vue'
primary_target: 'src/App.vue'
related_targets: []
---

# Desktop studio

Scope: the whole desktop app, two screens: the library (sites, themes, tutorials) and the editor of one tutorial (record, edit, play, publish). Visitor mode: Operate.

Audience and job: tutorial creators who are not developers record a flow of a web application in the built-in browser, polish its steps on a timeline, play them in the player and publish them to the web project or as a ZIP. Long desktop sessions on Windows, mouse and keyboard.

Constraints: plain words only (sites, themes, tutorials, steps, screenshots, markers); every change saved on its own with undo; standard controls; the recorded site view is a native webview that always draws above the interface.

## Direction contract

THESIS: The category standard of video editors, played straight at Camtasia's craft level: a dark workspace of panels around a viewer, a timeline of tracks, Record in red at the top left. It refuses the light card dashboard and the web-form editor the prototype was.

OWN-WORLD: Charcoal panels in three depths, hairline separators, light grey text with a dimmer secondary, the greens of the logo for selection, focus and the main action, the real logo in the library and on the Library button, record red only for recording; label colors per theme like clip colors; Segoe UI Variable at a compact 13px, tabular figures for every time.

STORY: The creator opens a site in the library, opens or creates a tutorial, records in the built-in browser, then trims, orders and annotates the steps on the timeline and the canvas, plays it, and publishes.

FIRST VIEWPORT: Editor. A 48px toolbar: Library with the logo, the one Record toggle, the tutorial title, undo and redo, save state, green Publish or Export at the right. A 252px Steps panel on the left; the viewer in the center on a near-black stage between a viewer bar (Site and Step views, address, Capture) and a playback bar; a 296px Properties panel on the right; a timeline with a ruler, a Steps track of step clips sized by time, a Markers track, and a playhead across both.

FORM: Category standard (canon), chosen by the user over the roll, seed 9b283581; reference product Camtasia.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
