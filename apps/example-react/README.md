# Exemple React

Application React autonome utilisant l’export public `@interactive-learning/player/react`. Aucun alias vers les sources du lecteur. Le guide partagé vient de `apps/example/public/example/guide.json` : captures et annotations du prototype HTML wireframe. Les captures métier locales ne sont pas servies.

Cet exemple importe le JSON, le valide avec `validateGuide`, puis transmet l’objet directement à la propriété `guide`. Les exemples Svelte et HTML chargent le même guide avec `src`. Le lecteur et les fonctionnalités restent identiques.

Depuis la racine du monorepo, après `pnpm install` :

```sh
pnpm build
pnpm dev:react
```

Ouvrir <http://127.0.0.1:4318/>. Lecture, pause, repères, informations et plein écran sont disponibles dans le lecteur. `src/App.tsx` montre l’intégration minimale.

Pour parcourir le prototype à capturer, lancer séparément `pnpm dev:wireframe` et ouvrir <http://127.0.0.1:4321/>. `pnpm dev:all` lance les quatre lecteurs uniquement.

```sh
pnpm --filter @interactive-learning/example-react typecheck
pnpm --filter @interactive-learning/example-react build
```
