---
name: interactive-learning
description: Build or update an Interactive Learning guide, a step-by-step walkthrough of a web application made of real screenshots, a cursor and numbered markers. Use it when the user asks to document, record or explain a flow of a website with screenshots, or to make a tutorial in Interactive Learning Studio. Do not use it to write end-to-end tests.
---

# Interactive Learning guides

A guide, which the studio calls a tutorial, is a `guide.json` file plus an `assets` folder of screenshots, played by the `<interactive-learning>` player. There are two ways to make one. Prefer the first.

- **Interactive Learning Studio, through its MCP server.** The desktop app of the user records the flow in its own browser, keeps the tutorial in the user's library and publishes it to the project. The user watches in its window, can take over at any moment, and comes back to the tutorial later to refine it.
- **The command line**, when the studio is not connected. You drive a browser, and the `interactive-learning` tool writes the guide into the public folder of the project.

When the user wants guides that a test run regenerates, with no studio and no agent, write them as scenarios of the project's end-to-end tests instead, as section 8 says.

## Teach, do not just click

A guide is watched by people who do not know the application yet. However you make it, follow these rules.

- **Start where the viewer already is.** The viewer is signed in: never show the sign-in page. Sign in before the first capture, start from the home page and follow the menu as a user would, one step per click, rather than opening an address directly.
- **Open a screen, then visit it.** For each screen the guide talks about, one step clicks to it, then the screen is visited element by element: one step for each of its three to five key elements, all on the same screenshot. In each, the cursor glides to the element without clicking (`"action": "move"`) and one marker sits beside it, so the viewer follows the pointer from point to point. Never name a tab or a section without opening it.
- **The step text carries the explanation.** One or two sentences on what the element or the screen does. A marker opens only when the viewer clicks it, so its text adds a detail, not the point.
- **Tell the story.** A few lines under the video say why: who works on the screen and what for, such as a group of companies that keep their own accounts. They are told on their own timing, not the steps': `story` lines `{ "atMs", "text" }` in the guide, each starting with a step and lasting until the next line, the last one ending with the guide. A player that knows `story` shows the line of the moment under the screen and stops it while a marker is read; an older one ignores it.
- **Markers sit beside the words, never on them.** The player draws a 24 px disc, about 30 px of a screenshot 1280 px wide shown in a 1000 px player, which hides any word under it. Measure the text of the target, not its box, since icons and padding are not text, and put the marker about 20 px from the text on a free side: right of a menu label, under a tab, left of a button and outside it. The cursor stays on the clicked element without covering its label, beside the text in a wide row, just under the word otherwise.
- **Number in reading order.** In a step that presents a screen and then clicks, the markers of what the screen shows come first and the marker of the click last.
- **Zoom now and then.** `"zoom": 1.6` on a step closes the camera in on its click while the cursor gets there, then goes back before the markers appear. Keep it for a few clicks of a guide, on a small target or a key action, and give the step 1.5 seconds more so its markers keep their time. An older player ignores it.
- **Give time to read.** About 5 seconds for a click, and 4 to 7 seconds for a visited element: 3 seconds plus about 20 ms per character of its text. Some 25 steps lasting two minutes is fine.
- **One format, 16:9.** Capture every step at the same 16:9 viewport, such as 1280 × 720 at a device scale factor of 2. The player takes the shape of the screenshot, and a taller one puts the bottom of the screen under its controls.
- **No personal data.** Do not capture lists of people, e-mail addresses or the real figures of a client when the guide is shown beyond that client. Present such a screen by its click and its text only, or record on demo data.
- **Check every step before you publish**, with its markers drawn on its screenshot. Recapture a step where a marker hides a word, the cursor misses its target or the wrong element is hovered.

## 1. Use the studio when it is connected

The studio is connected when you have the tools of its MCP server, `interactive-learning`, such as `list_library`, `create_tutorial`, `look` and `click` (in Claude Code, `mcp__interactive-learning__look`). The studio starts by itself when a tool needs it. Its server instructions give the whole workflow; here it is in short.

1. Call `list_library`. Reuse the site whose address matches the application, or call `create_site`. When the user works in the project of the site, set `publish_to` to the folder that serves guides, such as `<project>/public/guides`. Section 4 tells how to find that folder.
2. Call `create_tutorial` with a short title that starts with a verb. Its editor opens on the site, in the browser of the studio.
3. Call `open_page` on the first page of the flow. If the flow needs a signed-in user, ask the user to sign in in the browser of the studio, and wait for them. Never type real credentials.
4. Call `start_recording`, then repeat: `look`, read its screenshot and its elements, then `click` a ref. Each click becomes a step with the screen just before it, the cursor and a marker named after what was clicked. `type_text` fills a field with demo data, and the next click shows it filled. `capture_step` adds a screen without a click, such as the result at the end, with a marker on an element.
5. Call `stop_recording`, then `read_tutorial`. Give each step a title that starts with a verb and its explanation with `update_step`, and each marker a short name and what it does with `update_marker`, as the first section says. Check every step with `show_step`, the markers included. Delete a step that repeats the previous screen with nothing new.
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

With Playwright, drive the flow from a short Node script kept outside the project. Keep a fixed 16:9 viewport, such as 1280 by 720 with `deviceScaleFactor: 2`. Before each action, take `page.screenshot({ path, fullPage: false })`, read the click target with `locator.boundingBox()` and the address with `page.url()`. This script only drives the browser: never write it as a test and never add it to the project, unless the user wants guides that the tests regenerate (section 8).

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

1. Bring the page to the state you want to show and wait until it is stable, with content loaded and animations finished. Hover the element you are about to click, then hover it again just before the screenshot: an animation, such as a menu that scrolls as a group opens, can slide another element under the pointer.
2. Screenshot the visible viewport only, not the full page, as PNG, JPEG or WebP. Take it before the click you want to show. For a form, take it once the form is filled in and before it is submitted, then take the result on the next step.
3. Measure the click target in that same viewport, in CSS pixels, and place the cursor and its marker as the first section says. Then `x = targetX / viewportWidth` and `y = targetY / viewportHeight`, both between 0 and 1. If you are not sure of the position, leave `--x` and `--y` out.
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
- Keep titles short and start them with a verb. The step text explains, and markers add details.
- Set `--duration-ms` from the reading times of the first section.

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

## 8. Regenerate guides from the end-to-end tests

When the project has Playwright end-to-end tests and the user wants guides that a test run regenerates, with no studio and no agent, write each guide as a scenario beside the tests, such as `e2e/tuto/<module>/<theme>.spec.ts`, with its own Playwright configuration and a script such as `pnpm tuto`. These scenarios publish guides; they check nothing.

- Sign in through the fixtures of the tests before the first capture, then follow the rules of the first section.
- Add `@interactive-learning/recorder` as a dev dependency and build the guide with its API: `RecordingSession.create`, `addCapture`, `addAnnotation` and `validate`. Build it in a temporary folder, then replace the published guide in `<public folder>/guides/<module>/<slug>/` in one go. Keep the `id` and `createdAt` of the guide already published.
- A visit takes one screenshot and adds one capture per element with that same file, `cursor: { x, y, action: 'move' }`: the guide keeps one image and the cursor glides from element to element. Compute the `atMs` of each story line from the durations of the steps before it, and add `story` to the guide once it is validated.
- The scenario is the source: a text edited by hand in `guide.json` is lost at the next run, so texts change in the scenario.
- On Windows, copy and delete the files one by one: with Node.js 24, `fs.cpSync` stops the process on a path that holds a character outside ASCII, and `fs.rmSync` leaves such a folder in place without an error.

## Update an existing guide

- A tutorial of the studio changes through its tools, as section 1 says.
- To replace a screenshot and keep its texts, run `il capture replace --guide public/guides/register-trainee/guide.json --step STEP_ID --image /tmp/captures/new.png`. It removes the cursor of that step. Check the markers, and to show the click again add `"cursor": { "x": 0.82, "y": 0.18, "action": "click" }` to the step in `guide.json`.
- To change texts, edit `guide.json`, then run `il validate`.
- After an update, offer the web studio again, as in section 7.
- When the user wants to refine the guide in the browser extension, run `il export --guide public/guides/register-trainee/guide.json --out register-trainee.zip --zip` and tell them to import that ZIP from the extension panel.
- To copy a guide somewhere else, `il export --guide <guide.json> --out <new folder>` writes `guide.json` and its `assets` folder.
- `il --help` lists every command.
