![Interactive Learning — screenshot-based guides for Vue, React, Svelte and Web Components](.github/assets/banner.webp)

# Interactive Learning

Turn real screenshots into **interactive step-by-step guides**. Viewers play a guide like a short video, with an animated cursor and numbered markers, through one Web Component that works in **Vue, React, Svelte and plain HTML**.

## Record a guide

**With the browser extension.** Click its icon to open the side panel, name the guide and walk through your flow. Every click, page and filled form becomes a step with its screenshot, and **Capture step** keeps a form before you submit it. Open any step to place as many numbered markers as you need. The export is a ZIP with `guide.json` and its screenshots, and **Import** opens such a ZIP again, including one written by an AI agent. Load the extension in Chrome from `chrome://extensions` with **Load unpacked**, using the folder that `npx -y @interactive-learning/recorder extension path` prints. [Limits and permissions](apps/extension/README.md)

**With an AI agent.** Install the skill once, then ask the agent to document a flow of your site. It drives its browser and writes the guide into the public folder of the project.

```sh
npx -y @interactive-learning/recorder skill install --agent claude
npx -y @interactive-learning/recorder skill install --agent codex
```

**Refine it in the studio.** The studio opens a guide of your project in the browser, with the step editor of the extension and a live preview. Each save writes `guide.json` and its images in place, so a guide prepared by an AI agent is finished where it already lives.

```sh
npx -y @interactive-learning/recorder studio --guide public/guides/sign-up/guide.json
```

**From the command line.** `create`, `capture add`, `annotate` and `validate` build a guide from screenshot files. Run them with npx or add `@interactive-learning/recorder` as a dev dependency. [Recorder README](packages/recorder/README.md)

## Play a guide

```sh
npm install @interactive-learning/player
# or
pnpm add @interactive-learning/player
```

```html
<interactive-learning src="/guides/sign-up/guide.json"></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

Screenshots load from the folder of `guide.json`. The [player README](packages/player/README.md) covers frameworks, themes, languages and styling.

The packages are not on npm yet. Until they are, build this repository and install the archives of `pnpm release:pack`.

## Develop

Node.js 22.18 or later and pnpm 9.10.0.

```sh
pnpm install
pnpm build
pnpm dev:player
```

`pnpm dev:player` opens a live preview of the player on port 4316. `pnpm dev:all` starts the Vue, React, Svelte and HTML examples on ports 4317 to 4320, `pnpm dev:wireframe` a prototype to record on port 4321, and `pnpm dev:studio` the studio on a copy of the example guide. `pnpm check` runs the types, tests and builds.

| Folder              | Content                                                      |
| ------------------- | ------------------------------------------------------------ |
| `packages/player`   | Web Component player built with Lit                          |
| `packages/recorder` | Command line tool and API, with the extension and skill      |
| `packages/editor`   | Private step editor shared by the extension and the studio   |
| `packages/protocol` | Private guide format and validation, bundled into the others |
| `apps/extension`    | Browser extension                                            |
| `apps/studio`       | Studio, served by the `studio` command                       |
| `apps/example*`     | Example applications                                         |
| `skills`            | AI skill                                                     |

## License

MIT
