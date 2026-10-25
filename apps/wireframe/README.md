# Clickable HTML prototype

A neutral wireframe to practice recording, with no brand, business data, sign-in or network call. Grey blocks are static placeholders. Links, the form and the local project creation really work.

```sh
pnpm --filter @interactive-learning/wireframe dev
```

Open <http://127.0.0.1:4321/#/projects>.

The flow to capture has four screens.

1. On `#/projects`, click **Nouveau projet**.
2. On `#/projects/new`, fill in **Nom du projet** and optionally **Description**.
3. Capture the filled form, then click **Créer le projet**.
4. On `#/projects/demo`, the page shows the new project.

The `#/overview` and `#/activity` routes can be visited too. Typed names stay in memory in the tab and reset on reload. Opening `#/projects/demo` directly shows a predefined demo project.

Capture with a 1600 × 900 viewport. No delay or skeleton animation is needed.
