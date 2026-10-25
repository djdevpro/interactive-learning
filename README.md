![Interactive Learning — screenshot-based guides for Vue, React, Svelte and Web Components](.github/assets/banner.webp)

# Interactive Learning

Interactive guides built from **real screenshots and a JSON file**. A guide shows each screen of a web application with an animated cursor and numbered markers, and the viewer plays it like a short video. The player is a single Web Component built with Lit, so it works in **Vue, React, Svelte and plain HTML**.

There is no visual editor. Guides come from a browser extension, from an AI agent through a skill, or from code.

## Packages

| Package                                               | Use it to                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [`@interactive-learning/player`](packages/player)     | Play a guide anywhere with the `<interactive-learning>` tag |
| [`@interactive-learning/recorder`](packages/recorder) | Create guides from the command line, TypeScript or an AI    |

The packages are not published on npm yet. Until they are, build the repository and install the archives that `pnpm release:pack` produces.

## Play a guide

```html
<interactive-learning src="/guides/sign-up/guide.json"></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

The player is plain by default, with square corners, a neutral accent and the page font. The theme follows the operating system, and the bulb button switches between light and dark. Every text can be translated and every color changed with CSS custom properties. See the [player README](packages/player/README.md) for Vue, React, Svelte, languages and theming.

## Create a guide with an AI agent

Install the skill in one line.

```sh
npx -y @interactive-learning/recorder skill install --agent claude
```

```sh
npx -y @interactive-learning/recorder skill install --agent codex
```

Then ask your agent to "create an interactive guide that shows how to create a project on http://localhost:3000". The agent drives its browser, saves the screenshots and assembles the guide. The skill downloads the command line tool through npx when it needs it, so nothing else has to be installed. See the [skill README](skills/README.md).

## Create a guide with the browser extension

The extension records a walkthrough while you click through it. It ships inside the recorder package, and `npx -y @interactive-learning/recorder extension path` prints its folder. In Chrome, open `chrome://extensions`, turn on developer mode, choose **Load unpacked** and select that folder.

1. Open the page to document, then the extension popup.
2. Name the guide and start recording.
3. Walk through the flow. To keep a filled form, press **Capture this step** before you submit it.
4. Finish and export the JSON file, which contains the images.

See the [extension limits and permissions](apps/extension/README.md).

## Create a guide from the command line

```sh
npx -y @interactive-learning/recorder create --title "Register a trainee" --out ./guide/guide.json
npx -y @interactive-learning/recorder capture add --guide ./guide/guide.json --image ./capture.png --title "Add a trainee" --x 0.82 --y 0.18
npx -y @interactive-learning/recorder validate --guide ./guide/guide.json
npx -y @interactive-learning/recorder export --guide ./guide/guide.json --out ./guide-export --embed
```

Coordinates go from 0 to 1 within the screenshot of the click. Every command prints JSON with the identifiers it created. The [recorder README](packages/recorder/README.md) covers every command and the TypeScript API.

## Work on this repository

Node.js 22.18 or later and pnpm 9.10.0 are required.

```sh
pnpm install
pnpm build
pnpm dev:all
```

`pnpm dev:all` starts four applications that play the same guide.

| Application | Command           | Address                                           |
| ----------- | ----------------- | ------------------------------------------------- |
| Vue         | `pnpm dev:vue`    | [localhost:4317](http://127.0.0.1:4317/?sample=1) |
| React       | `pnpm dev:react`  | [localhost:4318](http://127.0.0.1:4318/)          |
| Svelte      | `pnpm dev:svelte` | [localhost:4319](http://127.0.0.1:4319/)          |
| HTML        | `pnpm dev:html`   | [localhost:4320](http://127.0.0.1:4320/)          |

To work on the player itself, run `pnpm dev:player`. It opens a live preview on [localhost:4316](http://127.0.0.1:4316/) with settings for the theme, language and colors, and every change in `packages/player/src` shows up at once. The Vue application also serves those sources during development. The React, Svelte and HTML applications use the built packages, like a real project, and need `pnpm build` to reflect a change. Each application loads an optional `src/custom.css` that shows how to restyle the player.

`pnpm dev:wireframe` starts a clickable HTML prototype on [localhost:4321](http://127.0.0.1:4321/) to practice recording. `pnpm example:assemble` rebuilds the shared example guide from its saved screenshots in `examples/wireframe`. In this repository, `pnpm cli` runs the recorder that `pnpm build` produced.

```text
packages/player/     Web Component player built with Lit, with a live preview
packages/recorder/   Command line tool and API, with the extension and skill inside
packages/protocol/   Private guide format and validation, bundled into the others
apps/extension/      Browser extension sources
apps/example*/       Vue, React, Svelte and HTML example applications
apps/wireframe/      Clickable prototype to record
skills/              AI skill
scripts/             Assembly and packaging scripts
```

`pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` check the repository, and `pnpm check` runs the first three. `pnpm changeset` describes a change for the next release.

## License

MIT
