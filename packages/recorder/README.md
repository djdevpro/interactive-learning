# @interactive-learning/recorder

Authoring tools for Interactive Learning guides. The recorder turns screenshots into a guide, whether they come from the companion browser extension, from an AI agent's own browser tools or from local files. It never drives a browser and never replays business actions.

Install it as a development dependency. The guide it produces is played by [`@interactive-learning/player`](https://www.npmjs.com/package/@interactive-learning/player), which does not need this package.

## Install

```sh
npm install --save-dev @interactive-learning/recorder
npx interactive-learning doctor
```

```sh
pnpm add -D @interactive-learning/recorder
pnpm exec interactive-learning doctor
```

Node.js 22.18 or later is required. `doctor` also reports whether the bundled extension, studio and AI skill are present.

## AI skill

Install the bundled skill for Claude Code or Codex in one line. No other installation is needed, because the skill runs this tool through npx.

```sh
npx -y @interactive-learning/recorder skill install --agent claude
npx -y @interactive-learning/recorder skill install --agent codex
```

`--agent claude` writes to `~/.claude/skills/interactive-learning` and `--agent codex` to `~/.agents/skills/interactive-learning`. For a project skill shared through a repository, use `--out .claude/skills/interactive-learning` or `--out .agents/skills/interactive-learning` instead. The command never overwrites an existing folder, so delete it to update the skill. `skill path` prints the folder of the bundled skill.

## Browser extension

`extension path` prints the folder of the bundled Chrome and Edge extension. Load it as an unpacked extension for this first version.

```sh
pnpm exec interactive-learning extension path
```

## Studio

```sh
pnpm exec interactive-learning studio --guide public/guides/sign-up/guide.json
```

The studio opens the guide in your browser to finish it by hand: steps on the left, the step editor in the middle and a live preview of the player on the right. Click a screenshot to add markers, drag or delete them, write their texts, and change step titles, page addresses and the guide title. **Replace image** swaps a screenshot, and a step can be deleted. `Ctrl` `S` saves the open step.

Every save rewrites `guide.json` in place and copies new images into `assets/`. An image that the guide no longer uses is deleted from `assets/` when the recorder created it and no other guide of the folder mentions it. If the file changed on disk since the studio read it, for example because an agent edited it, the save is refused and the studio offers to reload it.

The studio listens on `127.0.0.1` only, on a free port unless `--port` sets one, and answers only to the address it prints, which holds a token for this run. `--no-open` prints the address without opening the browser. The command runs until you press `Ctrl` `C`.

## Create a guide

```sh
pnpm exec interactive-learning create --title "Register a trainee" --out public/guides/sign-up/guide.json
pnpm exec interactive-learning capture add --guide public/guides/sign-up/guide.json --image captures/sign-up.png --url http://localhost:5173/trainees --title "Open sign-ups" --description "Click Add." --x 0.72 --y 0.18
pnpm exec interactive-learning annotate --guide public/guides/sign-up/guide.json --step STEP_ID --x 0.72 --y 0.18 --title "Add" --body "This button opens the form."
pnpm exec interactive-learning validate --guide public/guides/sign-up/guide.json
```

Create the guide in the public folder of the site, as above. Each imported screenshot is copied into `assets/` next to `guide.json` and referenced by a relative path, so the site serves the guide as is. Replace `STEP_ID` with the `stepId` that `capture add` returns. Coordinates go from 0 to 1 within the image. `--x` and `--y` are optional for a capture and must come together. A step lasts 2500 ms by default, like in the extension, and `--duration-ms` accepts 400 to 120000 ms. `--url` records the address of the page, which the player can show above the screenshot. Query strings are dropped, and a hash route such as `#/settings` is kept.

Every command prints a JSON object on stdout. On failure it writes `{ "ok": false, "error": { "code": "...", "message": "..." } }` on stderr and exits with code 1.

## Replace a screenshot

```sh
pnpm exec interactive-learning capture replace --guide public/guides/sign-up/guide.json --step STEP_ID --image captures/sign-up-v2.png
```

The step keeps its identifier, texts, duration and annotations. The cursor and the previous capture metadata are removed. The JSON result reports `annotationsRequireReview: true` when annotations need to be checked or moved. Images that are no longer used leave the manifest, and the source files are never deleted.

## Export

```sh
pnpm exec interactive-learning export --guide public/guides/sign-up/guide.json --out exports/sign-up
```

A guide created in the public folder of a site is ready to serve, so export only to copy it elsewhere. The target must be a folder that does not exist yet, and receives `guide.json` and its `assets/` folder. `--embed` writes a single JSON with the images inside as base64, which is much heavier to load, so keep it for offline sharing. The source guide stays unchanged.

```sh
pnpm exec interactive-learning export --guide public/guides/sign-up/guide.json --out sign-up.zip --zip
```

`--zip` writes one archive with `guide.json` and `assets/`. Import it in the browser extension to edit the guide there, then export it again.

## TypeScript API

```ts
import { RecordingSession, GuideExporter } from '@interactive-learning/recorder';

const session = await RecordingSession.create({
  filePath: 'guides/demo/guide.json',
  title: 'Discover the dashboard',
});
const step = await session.addCapture({
  imagePath: 'captures/dashboard.png',
  title: 'Create a folder',
  cursor: { x: 0.8, y: 0.2, action: 'click' },
});
await session.addAnnotation(step.id, { x: 0.8, y: 0.2, title: 'New folder' });
await session.validate();
await new GuideExporter(session.guidePath).export({ outDirectory: 'exports/demo' });
```

Open an existing guide with `new RecordingSession('guides/demo/guide.json')`. PNG, JPEG and WebP images up to 12 MiB are imported with the dimensions read from the file, copied under a name derived from their content and referenced by a relative path. Changes use a lock and an atomic write, and creating a guide never replaces an existing file. Exports refuse asset paths that leave the guide folder.

The package also exports `validateGuide`, `createGuide`, `GuideValidationError`, `SCHEMA_VERSION` and the guide types.

## Voice-over

A guide can tell a story under its screenshots: `story` lines, each with the moment it starts. `addVoiceOver` has [ElevenLabs](https://elevenlabs.io) read each line aloud, like the voice-over of a video, and gives each line the two fields that the player plays: `audio`, the sound, and `words`, each word with the moment it is said, which the player shows as captions lit as they are spoken.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { addVoiceOver, validateGuide } from '@interactive-learning/recorder';

const guide = validateGuide(JSON.parse(await readFile('public/guides/demo/guide.json', 'utf8')));
let atMs = 0;
guide.story = guide.steps.map((step) => {
  const line = { atMs, text: step.description || step.title };
  atMs += step.durationMs;
  return line;
});
const result = await addVoiceOver(guide, { guideDirectory: 'public/guides/demo' });
await writeFile('public/guides/demo/guide.json', `${JSON.stringify(guide, null, 2)}\n`);
console.log(result); // { spoken: 12, reused: 0, silent: 0, addedMs: 4300 }
```

- **Each line starts with a step**, and covers the steps until the next line. When a line, plus a pause of 800 ms, lasts longer than its steps, they get longer in proportion to their length, and the lines that follow move with them, so the voice always ends before the next line. `addedMs` gives the time added. A line that starts in the middle of a step is refused (`STORY_OFF_STEP`) before anything is read.
- **A line already read is never billed again.** Its sound is `voice/<fingerprint>.mp3` next to `guide.json`, with `voice/<fingerprint>.json` that keeps its length and its words, the fingerprint following from the text, the voice and the model. Run it again after an edit and only the new or rewritten lines are read. Publish the `voice` folder with the guide. Sounds that no line uses any more are deleted from that folder, and other files there are left alone.
- **The key comes from `ELEVENLABS_API_KEY`**, or `apiKey`. Never write it in the repository. Without a key, lines already read keep their voice and the others stay silent: `silent` counts them.
- Each request sends the lines before and after, so the voice keeps one tone from a line to the next. A refusal of ElevenLabs throws a `RecorderError` with the code `VOICE_OVER_FAILED`; the lines read before it stay in the folder, so the next run does not pay them again.
- `addVoiceOver` changes the guide in place and checks it. Write it afterwards.

| Option           | Default                     | What it sets                                                       |
| ---------------- | --------------------------- | ------------------------------------------------------------------ |
| `guideDirectory` | required                    | The folder of `guide.json`; sound paths are relative to it.        |
| `apiKey`         | `ELEVENLABS_API_KEY`        | The ElevenLabs key.                                                |
| `voiceId`        | `YxrwjAKoUKULGd0g8K9Y`      | The voice (`DEFAULT_VOICE_ID`).                                    |
| `modelId`        | `eleven_v4_turbo`           | The model (`DEFAULT_MODEL_ID`).                                    |
| `folder`         | `voice`                     | The folder of the sounds, a single name inside `guideDirectory`.   |
| `pauseMs`        | `800`                       | The silence left after a line before the next one.                 |
| `prune`          | `true`                      | Deletes the sounds of the folder that no line uses any more.       |
| `fetch`          | the global `fetch`          | The HTTP client, to go through a proxy or to test without network. |
| `baseUrl`        | `https://api.elevenlabs.io` | The address of the API.                                            |

The sounds are MP3 at 128 kbit/s, read through the `with-timestamps` endpoint of ElevenLabs. Players before 0.5.0 ignore `audio` and `words`.

## License

MIT
