---
name: interactive-learning
description: Build or update an Interactive Learning guide, a narrated step-by-step walkthrough of a web application made of real screenshots, a cursor, numbered markers and a voice-over. Use it when the user asks to document, record or explain a flow of a website with screenshots, or to make a tutorial or a video guide of it. The Playwright scenarios it writes publish guides and check nothing; do not use it to write end-to-end tests.
---

# Interactive Learning guides

A guide is a `guide.json` file, an `assets` folder of screenshots and a `voice` folder of sounds, played by the `<interactive-learning>` player like a narrated video.

**Make it with the recorder, driven from the web.** A Playwright scenario, run headless, signs in, follows the flow through the menus, takes the screenshots, builds the guide with the API of `@interactive-learning/recorder`, gives it its voice-over and publishes it into the public folder of the project. Running the scenario again regenerates the guide, so it stays true to the application. Sections 1 to 7 describe this way.

- Without Playwright, or for a single quick guide, the command line of the recorder builds a guide from screenshots taken by hand (section 8).
- Interactive Learning Studio, the desktop app, is coming but is not ready yet. Do not use it and do not offer it, unless the user asks for it by name (section 9).

## Teach, do not just click

A guide is watched by people who do not know the application yet. However you make it, follow these rules.

- **Start where the viewer already is.** The viewer is signed in: never show the sign-in page. Sign in before the first capture, start from the home page and follow the menu as a user would, one step per click, rather than opening an address directly.
- **Open a screen, then visit it.** For each screen the guide talks about, one step clicks to it, then the screen is visited element by element: one step for each of its three to five key elements, all on the same screenshot. In each, the cursor glides to the element without clicking (`"action": "move"`) and one marker sits beside it, so the viewer follows the pointer from point to point. Never name a tab or a section without opening it.
- **Let the voice teach.** Each step says something, read aloud while the step plays and shown as captions: two to four sentences of spoken French, or of the language of the application, that say what the screen or the element is for, who uses it, when and why, and what comes next, such as a group of companies that keep their own accounts. Write it as you would explain it to a new colleague beside you, not as a label. Two lines said before the same step, such as the opening of a part and what its first step says, are read in one go. The voice sets the pace: a step lasts until its line is said (section 5).
- **The step text stays short.** One sentence that the voice does not need to repeat. A marker opens only when the viewer clicks it, so its text adds a detail, not the point.
- **Markers sit beside the words, never on them.** The player draws a 24 px disc, about 30 px of a screenshot 1280 px wide shown in a 1000 px player, which hides any word under it. Measure the text of the target, not its box, since icons and padding are not text, and put the marker about 20 px from the text on a free side: right of a menu label, under a tab, left of a button and outside it. The cursor stays on the clicked element without covering its label, beside the text in a wide row, just under the word otherwise.
- **Number in reading order.** In a step that presents a screen and then clicks, the markers of what the screen shows come first and the marker of the click last.
- **Zoom now and then.** `"zoom": 1.6` on a step closes the camera in on its click while the cursor gets there, then goes back before the markers appear. Keep it for a few clicks of a guide, on a small target or a key action, and give the step 1.5 seconds more so its markers keep their time.
- **Give time to read.** At least about 5 seconds for a click, and 4 to 7 seconds for a visited element: 3 seconds plus about 20 ms per character of its text. The voice-over lengthens a step whose line lasts longer. Some 25 steps lasting three minutes is fine.
- **One format, 16:9.** Capture every step at the same 16:9 viewport, such as 1280 × 720 at a device scale factor of 2. The player takes the shape of the screenshot, and a taller one puts the bottom of the screen under its controls.
- **No personal data.** Do not capture lists of people, e-mail addresses or the real figures of a client when the guide is shown beyond that client. Present such a screen by its click and its voice only, or record on demo data.
- **Never fake a screen.** Never change the page, its DOM or its styles to get a nicer screenshot, and never invent an image. Use demo data: everything the scenario does in the browser really happens in the application.
- **Check every step before you publish**, with its markers drawn on its screenshot. Recapture a step where a marker hides a word, the cursor misses its target or the wrong element is hovered.

## 1. Set up the scenarios

- Write each guide as a scenario, such as `e2e/tuto/<module>/<guide>.spec.ts`, beside the end-to-end tests when the project has Playwright. Give the scenarios their own configuration, such as `e2e/tuto.config.ts`, and a script such as `pnpm tuto`. These scenarios publish guides; they check nothing, and the test runs of the project never pick them up.
- The configuration runs headless Chromium at the viewport of the guides (`viewport: { width: 1280, height: 720 }`, `deviceScaleFactor: 2`), with one worker, no retries, a timeout of several minutes and the address of the local application as `baseURL`.
- If the project has no Playwright yet, tell the user: Playwright downloads a browser of about 150 MB. Add `@playwright/test` as a development dependency once they agree, or use the command line of section 8.
- Add `@interactive-learning/recorder` as a development dependency, at least the version that exports `addVoiceOver`.
- Sign in through the fixtures or the stored session of the tests, before the first capture. Never type real credentials in a scenario: read the test accounts the project already uses.
- Put what every scenario shares in one helper beside them, such as `e2e/tuto/guide.ts`: open a screen by a click, visit its elements, say a line, publish. Each scenario then reads like the guide: the clicks, the elements, and what the voice says at each.

## 2. Find the public folder of the site

The site serves the guide as static files. Find the folder it serves as is at its root, from the stack of the project.

- `public/` for Vite, Vue, React, Next.js, Nuxt, Astro and recent Angular projects.
- `static/` for SvelteKit.
- The folder that holds `index.html` for a plain HTML site.

If you cannot tell, ask the user. Each guide goes in `<public folder>/guides/<module>/<guide>/`, with short kebab case names.

## 3. Capture a step

1. Bring the page to the state you want to show and wait until it is stable, with content loaded and animations finished. Hover the element you are about to click, then hover it again just before the screenshot: an animation, such as a menu that scrolls as a group opens, can slide another element under the pointer.
2. Take `page.screenshot({ path, fullPage: false })` into a working folder outside the public folder, before the click you want to show. For a form, take it once the form is filled in and before it is submitted, then show the result on the next step.
3. Measure the target in that same viewport with `locator.boundingBox()`, and the text inside it with a `Range` in `page.evaluate`, to place the cursor and the marker as the first section says. Positions go from 0 to 1: `x = targetX / viewportWidth`, `y = targetY / viewportHeight`. Keep `page.url()` as the address of the step.
4. A visit takes one screenshot and adds one step per element with that same file and `cursor: { x, y, action: 'move' }`: the guide keeps one image and the cursor glides from element to element.
5. A position always belongs to the screenshot of the same step. Never reuse a click position on the next page.

## 4. Build and publish the guide

Build the guide in a working folder, then replace the published guide in one go.

```ts
import { addVoiceOver, RecordingSession, validateGuide } from '@interactive-learning/recorder';

const session = await RecordingSession.create({
  filePath: `${work}/guide.json`,
  title,
  description,
});
for (const capture of captures) {
  const step = await session.addCapture({
    imagePath: capture.image,
    title: capture.title,
    description: capture.text,
    durationMs: capture.durationMs,
    cursor: capture.cursor, // { x, y, action: 'click' | 'move' }
    source: { capturedAt: capture.at, url: capture.url, viewport, dpr: 2 },
  });
  for (const marker of capture.markers) await session.addAnnotation(step.id, marker);
}
const guide = await session.validate();
// Keep the id and the creation date of the guide already published.
// Add `zoom` to a few steps, and `transition: 'fade'` where a new screen comes in.

let atMs = 0;
const starts = guide.steps.map((step) => (atMs += step.durationMs) - step.durationMs);
guide.story = lines.map((line) => ({ atMs: starts[line.beforeStep]!, text: line.text }));

const published = `public/guides/${module}/${slug}`;
const voice = await addVoiceOver(guide, { guideDirectory: published });
// Replace `${published}/assets` with the new screenshots, then write the guide.
await writeFile(`${published}/guide.json`, `${JSON.stringify(validateGuide(guide), null, 2)}\n`);
```

- Each line of the story starts with the step it was said before, and covers the steps until the next line. A line said after the last step would never be heard: refuse it.
- The scenario is the source. A text edited by hand in `guide.json` is lost at the next run, so texts change in the scenario.
- On Windows, copy and delete the files one by one: with Node.js 24, `fs.cpSync` stops the process on a path that holds a character outside ASCII, and `fs.rmSync` leaves such a folder in place without an error.

## 5. The voice-over

`addVoiceOver` has ElevenLabs read each line of the story and writes on it `audio`, the sound, and `words`, each word with the moment it is said, which the player shows as captions.

- The key is read from `ELEVENLABS_API_KEY`. Never write it in the repository, a scenario or a report. When it is missing, tell the user: lines already read keep their voice and the new ones stay silent, which the result counts in `silent`.
- A line already read is never billed again. Its sound is `voice/<fingerprint>.mp3` in the folder of the guide, named after its text, its voice and its model, so a run only pays for the lines that changed. Publish and commit the `voice` folder with the guide. The sounds that no line uses any more are deleted.
- Steps get longer where a line lasts longer than them, so the voice always ends before the next line: `addedMs` says by how much. Report the result of each guide: lines read, reused and silent.
- The default voice and model suit French guides. Pass `voiceId` or `modelId` only when the user asks for another voice: every line is then read again, and billed.

## 6. Run the scenarios and check the guide

Run the script of the scenarios, such as `pnpm tuto`, or one scenario with its file name. Then play the guide once, with the sound on, as the next section says. Check that each cursor points at the right element, that markers sit on the right spot, that the voice says what the screen shows and ends before the next line, and that no sensitive data is visible. Fix the scenario and run it again, then report the guide path and anything you could not capture.

## 7. Show the guide

The page that shows the guide only needs the tag of the npm package `@interactive-learning/player`, version 0.5.0 or later for the voice, the captions and `zoom`. The public folder is served at the site root, so the URL drops the folder name. `frame="browser"` shows the guide like a video in a browser window, and the speaker button mutes the voice.

```html
<interactive-learning
  src="/guides/bank/discover-the-settings/guide.json"
  frame="browser"
  lang="fr"
></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

If the project does not use the player yet, check the guide without adding a dependency. Create `preview.html` next to `guide.json` with the page below, open it through the dev server of the project, then delete it.

```html
<!doctype html>
<meta charset="utf-8" />
<interactive-learning src="./guide.json" frame="browser"></interactive-learning>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@interactive-learning/player/dist/auto.js/+esm"
></script>
```

## 8. Without Playwright: the command line

The recorder also builds a guide from screenshots taken one by one, in the browser of your harness. Below, `il` stands for `npx -y @interactive-learning/recorder`, which needs Node.js 22.18 or later. Run `il doctor` first, and stop and report its error if it fails.

- Use the browser built into your harness, such as the browser of Claude Code or Claude in Chrome, at a 16:9 viewport. Each screenshot must reach you as a file, because `capture add` imports files.
- Follow the rules of the first section and the captures of section 3, then build the guide in the public folder.

```sh
il create --title "Register a trainee" --out public/guides/register-trainee/guide.json
il capture add --guide public/guides/register-trainee/guide.json --image /tmp/captures/01.png --url http://localhost:5173/trainees --title "Open the sign-up form" --description "Click Add above the trainee list." --x 0.82 --y 0.18 --duration-ms 5000
il annotate --guide public/guides/register-trainee/guide.json --step STEP_ID --x 0.80 --y 0.18 --title "Add" --body "Opens the sign-up form."
il validate --guide public/guides/register-trainee/guide.json
```

- `capture add` copies the screenshot into `assets/` and prints the `stepId`. Leave `--x` and `--y` out when you are not sure of the position.
- To give this guide its voice, add its `story` and run `addVoiceOver` from a short Node script, as in section 4.
- `il studio --guide <guide.json>` opens the guide in a web page where the user can move markers, rewrite texts and replace screenshots by hand. Offer it at the end, and start it in the background when they accept, because it runs until it is stopped. Read `guide.json` again afterwards.
- `il capture replace --guide <guide.json> --step STEP_ID --image <new.png>` replaces a screenshot and keeps its texts, without its cursor. `il export --guide <guide.json> --out <folder>` copies a guide, and `--zip` makes an archive for the browser extension. `il --help` lists every command.

## 9. The desktop studio, coming

Interactive Learning Studio, the desktop app of the user, will record a flow in its own browser, keep the tutorial in a library and publish it to the project. It is not ready yet: make guides with the scenarios above, and do not offer the studio.

Only when the user asks for the studio by name and its MCP tools are connected (`interactive-learning`, such as `list_library`, `look` and `click`), follow its server instructions: find or create the site in `list_library`, `create_tutorial`, `open_page`, ask the user to sign in in the browser of the studio, `start_recording`, then `look` and `click` for each step, `stop_recording`, write the texts with `update_step` and `update_marker`, check with `show_step` and `publish_tutorial`. Change a tutorial of the studio only through its tools, never by writing its `guide.json`.

## Update an existing guide

- A guide made by a scenario changes in its scenario: edit the clicks, the texts or what the voice says, then run it again. Only the lines that changed are read again.
- A guide made with the command line changes with `il capture replace`, or by editing `guide.json` and running `il validate`.
- Ask before replacing a published guide that a scenario did not make.
