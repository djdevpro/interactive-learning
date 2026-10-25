---
name: interactive-learning
description: Build or update an Interactive Learning guide, a step-by-step walkthrough of a web application made of real screenshots, a cursor and numbered markers. Use it when the user asks to document, record or explain a flow of a website with screenshots. Do not use it to write end-to-end tests.
---

# Interactive Learning guides

A guide is a `guide.json` file plus an `assets` folder of screenshots. You drive the browser and save the screenshots. The `interactive-learning` command line tool turns them into a guide, and the `<interactive-learning>` player shows it. You never write test scripts for this.

## 1. Check the tools

The tool comes from the npm package `@interactive-learning/recorder`, which is usually not installed. Run it with npx, which downloads it on first use. It needs Node.js 22.18 or later.

```sh
npx -y @interactive-learning/recorder doctor
```

If `doctor` fails, stop and report the error. Below, `il` stands for `npx -y @interactive-learning/recorder`.

You also need a browser tool that can save a screenshot as a file. A screenshot that only appears in the conversation cannot be imported. If you cannot save files, stop and tell the user.

## 2. Put the guide in the public folder of the site

The site serves the guide as static files. Find the folder it serves as is at its root, from the stack of the project.

- `public/` for Vite, Vue, React, Next.js, Nuxt, Astro and recent Angular projects.
- `static/` for SvelteKit.
- The folder that holds `index.html` for a plain HTML site.

If you cannot tell, ask the user. Then create the guide in a `guides/<slug>` folder there, with a short kebab case slug.

```sh
il create --title "Register a trainee" --out public/guides/register-trainee/guide.json
```

Every screenshot you import is copied into `public/guides/register-trainee/assets/`, and `guide.json` refers to it with a relative path. The paths are therefore right without any other setting. Never embed images in the JSON as base64.

## 3. Add one step per screen

Save your raw screenshots in a temporary folder outside the public folder, because `capture add` copies them. Repeat for every step of the flow.

1. Bring the page to the state you want to show and wait until it is stable, with content loaded and animations finished.
2. Screenshot the visible viewport only, not the full page, as PNG, JPEG or WebP. Take it before the click you want to show. For a form, take it once the form is filled in and before it is submitted, then take the result on the next step.
3. Measure the click target in that same viewport, in CSS pixels. Then `x = targetX / viewportWidth` and `y = targetY / viewportHeight`, both between 0 and 1. If you are not sure of the position, leave `--x` and `--y` out.
4. Import the screenshot with the address of the page in `--url`. The player can show it above the screenshot. The JSON output gives the `stepId`.

```sh
il capture add --guide public/guides/register-trainee/guide.json --image /tmp/captures/01.png --url http://localhost:5173/trainees --title "Open the sign-up form" --description "Click Add above the trainee list." --x 0.82 --y 0.18
```

5. Optionally add a numbered marker that the viewer can open.

```sh
il annotate --guide public/guides/register-trainee/guide.json --step STEP_ID --x 0.82 --y 0.18 --title "Add" --body "Opens the sign-up form."
```

Follow these rules.

- Never change the page, its DOM or its styles to get a nicer screenshot, and never invent an image.
- A position always belongs to the screenshot of the same step. Never reuse a click position on the next page.
- Use demo data. Everything you do in the browser really happens in the application.
- Keep titles short and start them with a verb. Put details in markers.
- A step lasts 2500 ms. Use `--duration-ms 3000` to `3500` for dense screens.

## 4. Validate and show the guide

```sh
il validate --guide public/guides/register-trainee/guide.json
```

The page that shows the guide only needs the tag of the npm package `@interactive-learning/player`. The public folder is served at the site root, so the URL drops the folder name.

```html
<interactive-learning src="/guides/register-trainee/guide.json"></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

If the project does not use the player yet, check the guide without adding a dependency. Create `preview.html` next to `guide.json` with the page below, open it through the dev server of the project, then delete it.

```html
<!doctype html>
<meta charset="utf-8" />
<interactive-learning src="./guide.json"></interactive-learning>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@interactive-learning/player/dist/auto.js/+esm"
></script>
```

Play the guide once. Check that each cursor points at the right element, that markers sit on the right spot and that no sensitive data is visible. Fix and recapture what is wrong, then report the guide path and anything you could not capture.

## Update an existing guide

- To replace a screenshot and keep its texts, run `il capture replace --guide public/guides/register-trainee/guide.json --step STEP_ID --image /tmp/captures/new.png`. It removes the cursor of that step. Check the markers, and to show the click again add `"cursor": { "x": 0.82, "y": 0.18, "action": "click" }` to the step in `guide.json`.
- To change texts, edit `guide.json`, then run `il validate`.
- When the user wants to refine the guide by hand, tell them to run `npx -y @interactive-learning/recorder studio --guide public/guides/register-trainee/guide.json`. It opens the guide in their browser and saves it in place, and it keeps running until they stop it, so do not run it yourself unless they ask. Read `guide.json` again afterwards, since they may have changed it.
- When the user wants to refine the guide in the browser extension, run `il export --guide public/guides/register-trainee/guide.json --out register-trainee.zip --zip` and tell them to import that ZIP from the extension panel.
- To copy a guide somewhere else, `il export --guide <guide.json> --out <new folder>` writes `guide.json` and its `assets` folder.
- `il --help` lists every command.
