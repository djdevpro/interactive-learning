# React example

A standalone React 19 application that uses the `<interactive-learning>` Web Component from `@interactive-learning/player` directly, without any adapter or alias to the player sources. It plays the shared guide in `apps/example/public/example/guide.json`, made from screenshots of the wireframe prototype.

This example imports the JSON, validates it with `validateGuide` and assigns the object to the `guide` property. The Svelte and HTML examples load the same guide with `src`.

From the repository root, after `pnpm install`, run the following.

```sh
pnpm build
pnpm dev:react
```

Open <http://127.0.0.1:4318/>. `src/App.tsx` shows the minimal integration, `src/interactive-learning.d.ts` declares the tag for JSX type checking and `src/custom.css` restyles the player. Remove the import of `custom.css` in `src/main.tsx` to see the default look.

```sh
pnpm --filter @interactive-learning/example-react typecheck
pnpm --filter @interactive-learning/example-react build
```
