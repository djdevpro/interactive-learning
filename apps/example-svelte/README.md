# Exemple Svelte

Application Svelte 5 autonome utilisant l’export public `@interactive-learning/player/svelte`. Aucun alias vers les sources du lecteur. Le guide partagé vient de `apps/example/public/example/guide.json` : captures et annotations du prototype HTML wireframe. Les captures métier locales ne sont pas servies.

Depuis la racine du monorepo, après `pnpm install` :

```sh
pnpm build
pnpm dev:svelte
```

Ouvrir <http://127.0.0.1:4319/>. Lecture, pause, repères, informations et plein écran sont disponibles dans le lecteur. `src/App.svelte` montre l’intégration minimale.

Pour parcourir le prototype à capturer, lancer séparément `pnpm dev:wireframe` et ouvrir <http://127.0.0.1:4321/>. `pnpm dev:all` lance les quatre lecteurs uniquement.

```sh
pnpm --filter @interactive-learning/example-svelte typecheck
pnpm --filter @interactive-learning/example-svelte build
```
