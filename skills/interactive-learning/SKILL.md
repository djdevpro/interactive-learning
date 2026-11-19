---
name: interactive-learning
description: Build or update an Interactive Learning guide, a step-by-step walkthrough of a web application made of real screenshots, a cursor and numbered markers. Use it when the user asks to document, record or explain a flow of a website with screenshots, or to make a tutorial in Interactive Learning Studio. Do not use it to write end-to-end tests.
---

# Interactive Learning guides

A guide, which the studio calls a tutorial, is a `guide.json` file plus an `assets` folder of screenshots, played by the `<interactive-learning>` player. There are two ways to make one. Prefer the first.

- **Interactive Learning Studio, through its MCP server.** The desktop app of the user records the flow in its own browser, keeps the tutorial in the user's library and publishes it to the project. The user watches in its window, can take over at any moment, and comes back to the tutorial later to refine it.
- **The command line**, when the studio is not connected. You drive a browser, and the `interactive-learning` tool writes the guide into the public folder of the project.

## 1. Use the studio when it is connected

The studio is connected when you have the tools of its MCP server, `interactive-learning`, such as `list_library`, `create_tutorial`, `look` and `click` (in Claude Code, `mcp__interactive-learning__look`). The studio starts by itself when a tool needs it. Its server instructions give the whole workflow; here it is in short.

1. Call `list_library`. Reuse the site whose address matches the application, or call `create_site`. When the user works in the project of the site, set `publish_to` to the folder that serves guides, such as `<project>/public/guides`. Section 4 tells how to find that folder.
2. Call `create_tutorial` with a short title that starts with a verb. Its editor opens on the site, in the browser of the studio.
3. Call `open_page` on the first page of the flow. If the flow needs a signed-in user, ask the user to sign in in the browser of the studio, and wait for them. Never type real credentials.
4. Call `start_recording`, then repeat: `look`, read its screenshot and its elements, then `click` a ref. Each click becomes a step with the screen just before it, the cursor and a marker named after what was clicked. `type_text` fills a field with demo data, and the next click shows it filled. `capture_step` adds a screen without a click, such as the result at the end, with a marker on an element.
5. Call `stop_recording`, then `read_tutorial`. Give each step a title that starts with a verb and one sentence of text with `update_step`, and each marker a short name and what it does with `update_marker`. Check doubtful steps with `show_step`. Delete a step that repeats the previous screen with nothing new.
6. Call `publish_tutorial` when the site has a publish folder. The tutorial lands in `<publish_to>/<tutorial>/guide.json`, which the page of section 6 shows.
7. Report the tutorial with its site, theme and title, its steps, where it was published, and anything you could not capture. Tell the user it stays in their library, where they can open it, refine it and publish it again.

To change a tutorial of the studio, call `list_library` and `open_tutorial`, then `read_tutorial`, and record more steps or edit them the same way. Never write its `guide.json` yourself: go through the tools, so the studio shows each change and can undo it.

If the user has the studio but its tools are missing, tell them to open Settings in the studio, then MCP, to click Connect for their agent and to start a new session. Meanwhile, or when they do not use the studio, continue with the command line below.

## 2. Check the command line tool

The tool comes from the npm package `@interactive-learning/recorder`, which is usually not installed. Run it with npx, which downloads it on first use. It needs Node.js 22.18 or later.

```sh
npx -y @interactive-learning/recorder doctor
```

If `doctor` fails, stop and report the error. Below, `il` stands for `npx -y @interactive-learning/recorder`.

## 3. Choose the browser

Use the first of these that you have. Each screenshot must reach you as a file, because `capture add` imports files. An image that only appears in the conversation cannot be imported.

1. **The browser built into your harness.** Prefer it whenever your harness provides one, such as the browser of Claude Code or Claude in Chrome. Some harnesses save each screenshot and give you its path; import that file as is. Measure positions with its page or JavaScript tools.
2. **Playwright, only when your harness has no browser**, or when its screenshots never reach you as files.
   - If the project already depends on `playwright` or `@playwright/test`, use that copy. Run `npx playwright install chromium` if its browser is missing.
   - Otherwise tell the user, since Playwright downloads a browser of about 150 MB. Then install it in a temporary folder outside the project, so the project and its `package.json` stay untouched.

```sh
mkdir -p /tmp/il-browser && cd /tmp/il-browser
npm init -y && npm install playwright
npx playwright install chromium
```

With Playwright, drive the flow from a short Node script kept outside the project. Keep a fixed viewport such as 1280 by 800. Before each action, take `page.screenshot({ path, fullPage: false })`, read the click target with `locator.boundingBox()` and the address with `page.url()`. This script only drives the browser: never write it as a test and never add it to the project.

## 4. Put the guide in the public folder of the site

The site serves the guide as static files. Find the folder it serves as is at its root, from the stack of the project.

- `public/` for Vite, Vue, React, Next.js, Nuxt, Astro and recent Angular projects.
- `static/` for SvelteKit.
- The folder that holds `index.html` for a plain HTML site.

If you cannot tell, ask the user. Then create the guide in a `guides/<slug>` folder there, with a short kebab case slug.

```sh
il create --title "Register a trainee" --out public/guides/register-trainee/guide.json
```

Every screenshot you import is copied into `public/guides/register-trainee/assets/`, and `guide.json` refers to it with a relative path. The paths are therefore right without any other setting. Never embed images in the JSON as base64.

## 5. Add one step per screen

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

Follow these rules, with the studio too.

- Never change the page, its DOM or its styles to get a nicer screenshot, and never invent an image.
- A position always belongs to the screenshot of the same step. Never reuse a click position on the next page.
- Use demo data. Everything you do in the browser really happens in the application.
- Keep titles short and start them with a verb. Put details in markers.
- A step lasts 2500 ms. Use `--duration-ms 3000` to `3500` for dense screens.

## 6. Validate and show the guide

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

## 7. Offer the web studio

After the command line, end by offering to open the guide in the web studio, where the user can place markers, rewrite texts and replace screenshots by hand. If they accept, start it in the background, because it keeps running until it is stopped.

```sh
il studio --guide public/guides/register-trainee/guide.json
```

It opens their browser and prints its address; give them that address too. Each save writes `guide.json` and its images in place, so read `guide.json` again before you change the guide afterwards.

## Update an existing guide

- A tutorial of the studio changes through its tools, as section 1 says.
- To replace a screenshot and keep its texts, run `il capture replace --guide public/guides/register-trainee/guide.json --step STEP_ID --image /tmp/captures/new.png`. It removes the cursor of that step. Check the markers, and to show the click again add `"cursor": { "x": 0.82, "y": 0.18, "action": "click" }` to the step in `guide.json`.
- To change texts, edit `guide.json`, then run `il validate`.
- After an update, offer the web studio again, as in section 7.
- When the user wants to refine the guide in the browser extension, run `il export --guide public/guides/register-trainee/guide.json --out register-trainee.zip --zip` and tell them to import that ZIP from the extension panel.
- To copy a guide somewhere else, `il export --guide <guide.json> --out <new folder>` writes `guide.json` and its `assets` folder.
- `il --help` lists every command.
