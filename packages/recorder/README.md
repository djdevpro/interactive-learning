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

Node.js 22.18 or later is required. `doctor` also reports whether the bundled extension and AI skill are present.

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

## Create a guide

```sh
pnpm exec interactive-learning create --title "Register a trainee" --out guides/sign-up/guide.json
pnpm exec interactive-learning capture add --guide guides/sign-up/guide.json --image captures/sign-up.png --title "Open sign-ups" --description "Click Add." --x 0.72 --y 0.18
pnpm exec interactive-learning annotate --guide guides/sign-up/guide.json --step STEP_ID --x 0.72 --y 0.18 --title "Add" --body "This button opens the form."
pnpm exec interactive-learning validate --guide guides/sign-up/guide.json
```

Replace `STEP_ID` with the `stepId` that `capture add` returns. Coordinates go from 0 to 1 within the image. `--x` and `--y` are optional for a capture and must come together. A step lasts 2500 ms by default, like in the extension, and `--duration-ms` accepts 400 to 120000 ms.

Every command prints a JSON object on stdout. On failure it writes `{ "ok": false, "error": { "code": "...", "message": "..." } }` on stderr and exits with code 1.

## Replace a screenshot

```sh
pnpm exec interactive-learning capture replace --guide guides/sign-up/guide.json --step STEP_ID --image captures/sign-up-v2.png
```

The step keeps its identifier, texts, duration and annotations. The cursor and the previous capture metadata are removed. The JSON result reports `annotationsRequireReview: true` when annotations need to be checked or moved. Images that are no longer used leave the manifest, and the source files are never deleted.

## Export

```sh
pnpm exec interactive-learning export --guide guides/sign-up/guide.json --out public/guides/sign-up
pnpm exec interactive-learning export --guide guides/sign-up/guide.json --out exports/sign-up --embed
```

The export target must be a folder that does not exist yet. The first form writes `guide.json` and an `assets/` folder. With `--embed`, it writes a single JSON file with the images inside. The source guide stays unchanged.

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

## License

MIT
