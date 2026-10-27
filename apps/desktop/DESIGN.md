---
name: Interactive Learning Studio
description: A dark desktop editor for interactive tutorials, built like a video editor.
colors:
  stage: '#0f1012'
  app: '#151619'
  panel: '#1c1d20'
  raised: '#25272b'
  high: '#2f3136'
  line: '#2c2e33'
  line-strong: '#3c3f45'
  text: '#e8e9eb'
  text-soft: '#b0b4bb'
  text-faint: '#8b9098'
  brand: '#1c6651'
  accent: '#1f7a5c'
  accent-hover: '#248a68'
  accent-text: '#4fbf98'
  accent-soft: 'rgb(79 191 152 / 16%)'
  on-accent: '#ffffff'
  record: '#d43b40'
  record-hover: '#e2494e'
  done: '#43b581'
  changed: '#e6a23c'
  danger: '#e5484d'
  danger-text: '#ff8085'
  danger-ground: '#3a1d1f'
  line-hover: '#4a4e55'
  label-blue: '#4c8dff'
  label-teal: '#2bb3a3'
  label-green: '#57b560'
  label-yellow: '#dfb33f'
  label-orange: '#ee8a3c'
  label-pink: '#e2598f'
  label-purple: '#9b6ef0'
  label-slate: '#8b95a5'
  marker-ink: '#2f3542'
typography:
  display:
    fontFamily: 'Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '1.625rem'
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: '-0.005em'
  headline:
    fontFamily: 'Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    letterSpacing: '-0.005em'
  title:
    fontFamily: 'Segoe UI Variable Display, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '-0.005em'
  body:
    fontFamily: 'Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: 'Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '0.6875rem'
    fontWeight: 600
    lineHeight: 1
  figures:
    fontFamily: 'Segoe UI Variable Text, Segoe UI Variable, Segoe UI, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
    fontFeature: 'tnum'
rounded:
  sm: '4px'
  md: '6px'
  lg: '10px'
  pill: '999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '24px'
  '6': '32px'
  '7': '48px'
components:
  button:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '30px'
  button-hover:
    backgroundColor: '{colors.high}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '30px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-record:
    backgroundColor: '{colors.record}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '30px'
  button-record-hover:
    backgroundColor: '{colors.record-hover}'
  button-quiet:
    textColor: '{colors.text-soft}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '30px'
  button-small:
    typography: '{typography.label}'
    padding: '0 8px'
    height: '26px'
  input:
    backgroundColor: '{colors.app}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '5px 9px'
    height: '30px'
  segmented-option-selected:
    backgroundColor: '{colors.high}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    padding: '0 8px'
    height: '24px'
  menu:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: '4px'
  menu-item-hover:
    backgroundColor: '{colors.accent}'
    rounded: '{rounded.md}'
    height: '30px'
  dialog:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: '24px'
    width: '420px'
  marker-chip:
    backgroundColor: '{colors.high}'
    textColor: '{colors.text-soft}'
    typography: '{typography.label}'
    rounded: '11px'
    padding: '0 8px 0 3px'
    height: '22px'
---

# Design System: Interactive Learning Studio

## Overview

**Creative North Star: "The Editing Bay"**

The studio is a video editor for tutorials, built to the category standard with Camtasia as the craft reference. A dark workspace of charcoal panels surrounds a near-black stage where the step is shown. Panels are separated by hairlines, not by gaps or cards. The tutorial reads left to right on a timeline of tracks, with a playhead across them.

Color is functional and scarce. Everything is grey except three signals: the green of the logo for the main action, selection and focus; red only for recording; and the label color of each theme, carried by its clips like clip colors in an editor. Type is Segoe UI Variable at a compact 13px, so long sessions fit a lot on screen, and every time and count uses tabular figures so numbers do not jump while playing.

Two screens share the system. The library is a project browser: sites in a left panel, the tutorials of the open site grouped by theme as thumbnails. The editor is the editing bay: toolbar, steps panel, viewer with its bar and transport, properties panel, and the timeline below.

**Key Characteristics:**

- Three panel depths (stage, app, panel) plus raised controls, divided by 1px hairlines.
- The greens of the logo for the main action, selection and focus; red for recording and nothing else.
- The real logo, three white bars on its green tile, at the head of the library and on the toolbar's Library button.
- One Record control, at the top left of the toolbar; the viewer keeps its bar in every view.
- Theme label colors used as clip colors on the timeline and as dots in the library.
- Segoe UI Variable, 13px body, tabular figures for every time and count.
- Flat panels; shadows only on things that float (menus, dialogs, toasts, the zoom bar, a dragged clip).

## Colors

A charcoal neutral ramp with the greens of the logo, one recording red, and eight label colors that belong to themes.

### Primary

- **Logo Green** (brand): the tile of the logo, as the app icon draws it, under three white bars. It appears in the logo only.
- **Action Green** (accent): fills the one main action of a screen (Publish, Export, New tutorial, Play), the menu item under the pointer, the monogram of the current site, and the "On screen" handle. White text on it reads at 5.2:1. Hover lifts to **Action Green Hover** (accent-hover).
- **Selection Green** (accent-text): the lighter green for lines and text on dark, at 7.4:1 on panels: focus outlines and focused field borders, the selected clip border, the playhead, the drop line, the step number of the current row, and links.
- **Selection Wash** (accent-soft): a translucent green behind the current site, the current step row and the selected marker row, and for text selection.

### Secondary

- **Record Red** (record): the dot of the toolbar Record toggle and the whole toggle while it records, the Record button of the empty viewer, and the red border drawn around the built-in browser while it records. Hover is **Record Red Hover** (record-hover).

### Tertiary

- **Theme labels** (label-blue, label-teal, label-green, label-yellow, label-orange, label-pink, label-purple, label-slate): each theme picks one. It shows as a square dot next to the theme in the library and in the editor breadcrumb, as the number badge of each clip, and, mixed into the panel color, as the clip body (34% label in oklab) and clip border (70% label).
- **Marker Ink** (marker-ink): the dark slate fill of numbered marker discs, with a white ring, matching the marker the player draws.

### Neutral

- **Stage** (stage): the near-black behind the viewer and behind every thumbnail.
- **App** (app): the window background, the timeline lanes, and the sunken fill of fields.
- **Panel** (panel): the toolbar, steps panel, viewer bar, properties panel, transport, timeline and dialogs.
- **Raised** (raised): default buttons, menus, the ruler and track names, the floating zoom bar.
- **High** (high): button hover, pressed quiet buttons, the selected segment, toasts, marker chips.
- **Hairline** (line) and **Strong Hairline** (line-strong): separators between regions, and the borders of controls.
- **Text** (text), **Soft Text** (text-soft) and **Faint Text** (text-faint): primary content, secondary labels, and metadata, placeholders and tick labels. All three stay above 4.5:1 on panels.
- **Status** (done, changed): small dots for Published and Changed since publishing. **Danger** (danger): the delete confirmation button and the error toast border.

### Named Rules

**The Record Red Rule.** Record red marks recording and nothing else: the Record button, its dot, and the frame of the browser while it records. Destructive actions use the separate danger red, and only in the confirmation step.

**The One Green Rule.** Green means "this is the main action" or "this is selected". One filled green button per screen; every other button is grey. Logo Green belongs to the logo alone.

**The Clip Color Rule.** Label colors belong to themes. They color clips, dots and number badges, never buttons, text or panels.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)

**Character:** The Windows system face at its optical sizes, set small and dense like desktop software. Headings use the Display cut at weight 600 with a very slight negative tracking (-0.005em).

### Hierarchy

- **Display** (600, 26px, 1.15): the site name at the top of the library and the first-launch welcome.
- **Headline** (600, 20px): the message in the empty viewer and empty browser.
- **Title** (600, 16px, 1.2): theme names in the library, dialog titles, the step title in the properties panel. Tutorial names on thumbnails use 14px at 600.
- **Body** (400, 13px, 1.45): everything else by default, including buttons (at 500) and fields.
- **Label** (400, 12px): metadata, hints, field labels, clip captions, marker chips, save state, small buttons.
- **Caption** (600, 11px): panel group headers (Sites, Steps, Timing, Screenshot, Markers) in uppercase with 0.04 to 0.05em tracking, tick labels on the ruler, clip numbers, keyboard keys.

### Named Rules

**The Tabular Time Rule.** Every time, duration, count and step number is set with tabular figures (`font-variant-numeric: tabular-nums`), so values do not shift while the playhead moves.

**The Compact Scale Rule.** Body text is 13px. Sizes come from the seven-step scale (11, 12, 13, 14, 16, 20, 26px); nothing larger than 26px appears in the interface.

## Layout

The window never scrolls; regions scroll inside it.

**Editor.** A three-row grid: a 48px toolbar, the body, and the timeline. The toolbar holds Library with the logo, the Record toggle, a breadcrumb (site, theme dot, editable tutorial title), then on the right the save state, undo and redo, and the green Publish or Export. The body is three columns: a 252px steps panel, the viewer, and a 296px properties panel; every column starts at zero width, so content never pushes a region under its neighbor down to the smallest window (1000 by 640). The viewer is the stage between a 40px viewer bar (Site and Step views, back, forward, reload, the address field, Capture) and a 40px transport (previous, round green Play, next, current time over total time, step position). The steps panel opens on a 40px head level with the viewer bar. The timeline has a 36px tool bar, then an 88px column of track names beside a horizontally scrolling canvas of three rows: a 24px ruler, a 92px Steps track of step clips whose width is their duration, and a 34px Markers track. The playhead crosses all three rows.

**Library.** Two columns: a 252px sites panel (the logo and the app name in a 52px head, sites with their themes nested below, New site and Library folder at the foot) and the open site. The site area has a sticky translucent head with the site name, its address and publish folder, search, New theme and the green New tutorial. Themes follow as sections, each a hairline-ruled header with its label dot, then a grid of tutorial thumbnails (16:10, at least 216px wide) ending with a dashed "New tutorial in" tile.

**Spacing.** A 4px base scale (4, 8, 12, 16, 24, 32, 48). Panels pad 8px inside lists and 16px in the properties panel; the library content sits 32px from its edges. Gaps between toolbar items are 6px.

## Elevation & Depth

Depth comes from tone, not shadow. The stage is darkest, the window is next, panels sit one step lighter, and controls on panels one step lighter again. Regions meet at 1px hairlines; the timeline is set off by the strong hairline. Shadows are kept for things that float above the panels.

### Shadow Vocabulary

- **Lift** (`box-shadow: 0 1px 0 rgb(255 255 255 / 4%) inset, 0 12px 32px rgb(0 0 0 / 50%)`): menus, dialogs, toasts, the floating zoom bar on the canvas, and a clip while it is dragged.
- **Screen on stage** (`box-shadow: 0 0 0 1px rgb(255 255 255 / 8%), 0 12px 40px rgb(0 0 0 / 55%)`): the screenshot of the step on the canvas.
- **Thumbnail hover** (`box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%), 0 10px 28px rgb(0 0 0 / 45%)`): a tutorial thumbnail under the pointer in the library.
- **Off-screen dim** (`box-shadow: 0 0 0 100vmax rgb(8 9 11 / 55%)`): darkens the part of a long page that is not on screen, around the green "On screen" frame.

### Named Rules

**The Flat Panel Rule.** Panels, toolbars and tracks have no shadow. If it does not float, it does not cast one.

**The Screenshot Edge Rule.** Every screenshot thumbnail carries a 1px white edge at 10% opacity, inset, so light pages keep their outline on dark panels.

## Shapes

Small, even corners: 4px for thumbnails and segments, 6px for buttons, fields and rows, 10px for menus, dialogs, toasts and thumbnail cards, 5px for clips. Circles mark things that point at the screen or play it: marker discs, step number discs, the Play button, label chips. The address bar of the built-in browser is a full pill (14px). Borders are 1px; dashed borders mean "add something here" (the new tutorial tile, the empty library folder field).

## Components

### Buttons

Buttons share one shape; the color says what the action is.

- **Shape:** gently rounded (6px), 30px tall, 1px border, label at weight 500 with an optional 18px line icon.
- **Default:** raised fill with a strong hairline border; hover goes one depth higher.
- **Primary:** Action Green fill and border, white text. One per screen.
- **Record:** Record Red fill, white text, for the Record button of the empty viewer. The toolbar Record toggle is a default button with a red dot; while recording it fills red, reads "Recording · 3" with the count of steps, and its dot turns white and pulses (1.2s).
- **Quiet:** transparent, soft text, a 7% white wash on hover; pressed state takes the high depth.
- **Danger:** danger red fill, used in the delete confirmation dialog only.
- **Sizes:** small (26px, 12px text), icon (30px square, 26px when small), large (38px, 14px text). Icon buttons extend their hit area 4px on every side.
- **Press:** scales to 0.96 on press; transitions run 120ms on the studio easing.

### Inputs / Fields

- **Style:** sunken into the panel: app fill, strong hairline border, 6px corners, 30px tall, padding 5px 9px. Field labels sit above in 12px soft text.
- **Hover / Focus:** the border brightens on hover and turns Selection Green on focus, with no outline ring.
- **Inline titles:** the tutorial title in the toolbar and the step title in the properties panel look like text until hovered (a hairline border appears) or focused (sunken fill, green border).
- **Error:** error text in 12px light red under the field.

### Segmented control

- **Segmented:** a sunken track with 2px padding; options are 24px with 4px corners; the chosen one takes the high depth. Used for the Site and Step views of the viewer, and for Fade or Cut.

### Menus and dialogs

- **Menus:** raised, 10px corners, 4px padding, Lift shadow, opened with the popover API under their button. Items are 30px rows; the item under the pointer fills Action Green. Destructive items use light red text and fill danger red on hover.
- **Dialogs:** 420px wide on the panel depth, 24px padding, 10px corners, a 55% black backdrop. Used only to name something new or to confirm a deletion.
- **Toasts:** at the bottom center, high depth, 10px corners, Lift shadow, rising 8px over 200ms.

### Navigation

- **Library sites panel:** 32px site rows with a 20px monogram; the current site takes Selection Wash and an Action Green monogram. Themes nest under it as 28px rows with their label dot and count.
- **Editor toolbar breadcrumb:** soft text with chevrons, the theme dot before its name, the tutorial title in full text at 600.
- **Steps panel:** a 40px head with the panel name as a caption and its count, then one row per step: its number, a 72 by 45 thumbnail, the title, and its time and markers. The current step takes Selection Wash and a Selection Green number. Alt+Up and Alt+Down move a step.

### Logo

- The logo component draws the app icon: a Logo Green tile with 28/128 corners and three rounded white bars of different heights. It sits at 26px at the head of the sites panel, 56px on the welcome screen and 20px inside the toolbar's Library button, and is never recolored, outlined or replaced by an icon.

### Timeline (signature)

- **Tool bar:** Duplicate and Delete for the selected step, then on the right the count of steps and the total time, Fit, and the zoom slider.
- **Ruler:** raised depth, 5px minor ticks and 9px major ticks with 11px tabular labels.
- **Step clips:** absolutely placed in the Steps track, width set by duration, 5px corners. The body is a film strip of the step's screenshot over the clip's deep label shade; a 22px caption under it holds the label-colored number badge, the title, and the duration. The selected clip gets a Selection Green border and ring; a dragged clip lifts with the Lift shadow. A trim handle appears at the right edge on hover.
- **Joints:** 22px round buttons between clips show and change the transition (fade or cut).
- **Markers track:** 22px rounded chips, each with a marker disc and the marker name.
- **Playhead:** a 2px Selection Green line with a 12px rounded head across ruler and tracks.

### Viewer and canvas

- The step's screenshot hangs on the stage with 2px corners and the screen shadow; the pointer is a crosshair for adding markers.
- **Markers:** 28px discs in Marker Ink with a white 2px ring and a bold white number; selected markers add a 3px Selection Green ring; hover grows them to 1.08.
- **On screen frame:** a 2px Selection Green outline around the part of the page that was on screen, with an Action Green "On screen" handle to drag it.
- **Zoom bar:** a floating raised strip at the bottom right with zoom out, the percentage, and zoom in.
- **Viewer bar:** a 40px panel bar that stays in every view: the Site and Step views, back, forward, reload, the pill address field and Capture. In the Site view the page of the built-in browser sits on the stage, framed in red while recording. Play shows the player in the viewer, and a pause returns to the view it left.

### Named Rules

**The Single Record Rule.** Recording starts and stops from one control, the toggle at the top left of the toolbar. The empty viewer repeats it only while a tutorial has no step yet.

### Library thumbnails

- 16:10 screenshot on the stage color with 6px corners, inside a 10px card that takes a 4% white wash on hover. Under it: the tutorial name (14px, 600), its steps and duration in tabular figures, and a status dot (green for Published, amber for Changed). The more menu appears on hover at the top right.

## Do's and Don'ts

### Do:

- **Do** separate regions with 1px hairlines (line, line-strong) on tonal depths, not with gaps, cards or shadows.
- **Do** keep one filled green button per screen, for its main action.
- **Do** use Selection Green (accent-text) for every focus outline, focused border, selected item and the playhead.
- **Do** set every time, duration, count and step number with tabular figures.
- **Do** color clips, theme dots and clip numbers with the theme's label color, and keep the label off everything else.
- **Do** use the shared button, field, segmented, menu and dialog styles; size small controls with the small and icon variants and keep their extended hit area.
- **Do** draw icons from the studio's 24px line set at stroke 1.75, in the current text color.
- **Do** give every screenshot thumbnail the faint white inset edge.
- **Do** draw the logo with its component, in its own green.
- **Do** honor reduced motion: transitions and animations drop to 1ms.

### Don't:

- **Don't** use record red for anything but recording.
- **Don't** add a second Record control or a tab that splits the steps into another view of the same screenshots.
- **Don't** put shadows on panels, toolbars, tracks or rows; only floating things lift.
- **Don't** introduce a light theme surface, a card dashboard, or web-form page layout inside the studio.
- **Don't** set interface text above 26px or below 11px, or use a face other than Segoe UI Variable.
- **Don't** add uppercase tracked labels above headings; uppercase 11px is for panel group headers only, and it is the heading itself.
- **Don't** open a dialog for anything but naming something new or confirming a deletion.
