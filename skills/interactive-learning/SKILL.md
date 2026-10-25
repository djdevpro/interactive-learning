---
name: interactive-learning
description: Build or update an Interactive Learning guide, a step-by-step walkthrough of a web application made of real screenshots, a cursor and numbered markers. Use it when the user asks to document, record or explain a flow of a website with screenshots. Do not use it to write end-to-end tests.
---

# Interactive Learning guides

A guide is a `guide.json` file plus screenshots. You drive the browser and save the screenshots. The `interactive-learning` command line tool turns them into a guide, and the Interactive Learning player plays it. You never write test scripts for this.

## 1. Check the tools

The tool comes from the npm package `@interactive-learning/recorder`, which is usually not installed. Run it with npx, which downloads it on first use. It needs Node.js 22.18 or later.

```sh
npx -y @interactive-learning/recorder doctor
```

If `doctor` fails, stop and report the error. Below, `il` stands for `npx -y @interactive-learning/recorder`. When the project already has the package, `npx interactive-learning` works too.

You also need a browser tool that can save a screenshot as a file. A screenshot that only appears in the conversation cannot be imported. If you cannot save files, stop and tell the user. They can record the flow with the browser extension instead, whose folder `il extension path` prints.

## 2. Create the guide

```sh
il create --title "Register a trainee" --out ./guide/guide.json
```

## 3. Add one step per screen

Repeat for every step of the flow.

1. Bring the page to the state you want to show and wait until it is stable, with content loaded and animations finished.
2. Screenshot the visible viewport only, not the full page, and save it as PNG, JPEG or WebP. Take it before the click you want to show. For a form, take it once the form is filled in and before it is submitted, then take the result on the next step.
3. Measure the click target in that same viewport, in CSS pixels. Then `x = targetX / viewportWidth` and `y = targetY / viewportHeight`, both between 0 and 1. If you are not sure of the position, leave `--x` and `--y` out.
4. Import the screenshot. The JSON output gives the `stepId`.

```sh
il capture add --guide ./guide/guide.json --image ./captures/01.png --title "Open the sign-up form" --description "Click Add above the trainee list." --x 0.82 --y 0.18
```

5. Optionally add a numbered marker that the viewer can open.

```sh
il annotate --guide ./guide/guide.json --step STEP_ID --x 0.82 --y 0.18 --title "Add" --body "Opens the sign-up form."
```

Follow these rules.

- Never change the page, its DOM or its styles to get a nicer screenshot, and never invent an image.
- A position always belongs to the screenshot of the same step. Never reuse a click position on the next page.
- Use demo data. Everything you do in the browser really happens in the application.
- Keep titles short and start them with a verb. Put details in markers.
- A step lasts 2500 ms. Use `--duration-ms 3000` to `3500` for dense screens.

## 4. Validate and export

```sh
il validate --guide ./guide/guide.json
il export --guide ./guide/guide.json --out ./guide-export --embed
```

`--out` must be a folder that does not exist yet. `--embed` puts the images inside `guide.json`. Without it, the export holds `guide.json` and an `assets` folder.

## 5. Show the result

The player is the `<interactive-learning>` tag of the npm package `@interactive-learning/player`, and it works in any framework. If the project already uses it, show the guide there. Otherwise create `preview.html` in the export folder.

```html
<!doctype html>
<meta charset="utf-8" />
<interactive-learning src="./guide.json"></interactive-learning>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@interactive-learning/player/dist/auto.js/+esm"
></script>
```

Serve the folder over HTTP, for example with `npx -y serve ./guide-export`, and open the printed address. Opening the file directly blocks the download of `guide.json`.

Play the guide once. Check that each cursor points at the right element, that markers sit on the right spot and that no sensitive data is visible. Fix and recapture what is wrong, then report the guide path and anything you could not capture.

## Update an existing guide

- To replace a screenshot and keep its texts, run `il capture replace --guide ./guide/guide.json --step STEP_ID --image ./captures/new.png`. It removes the cursor of that step. Check the markers, and to show the click again add `"cursor": { "x": 0.82, "y": 0.18, "action": "click" }` to the step in `guide.json`.
- To change texts, edit `guide.json`, then run `il validate`.
- `il --help` lists every command.
