# Svelte example

A standalone Svelte 5 application that uses the `<interactive-learning>` Web Component from `@interactive-learning/player` directly, without any adapter or alias to the player sources. It loads the shared guide in `apps/example/public/example/guide.json`, made from screenshots of the wireframe prototype.

From the repository root, after `pnpm install`, run the following.

```sh
pnpm build
pnpm dev:svelte
```

Open <http://127.0.0.1:4319/>. `src/App.svelte` shows the minimal integration, `src/interactive-learning.d.ts` declares the tag for Svelte type checking and `src/custom.css` restyles the player. Remove the import of `custom.css` in `src/main.ts` to see the default look.

```sh
pnpm --filter @interactive-learning/example-svelte typecheck
pnpm --filter @interactive-learning/example-svelte build
```
