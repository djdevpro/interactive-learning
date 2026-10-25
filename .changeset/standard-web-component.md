---
'@interactive-learning/player': minor
---

Rebuild `<interactive-learning>` as a standard Web Component written with Lit. It is now the single implementation of the player, without any embedded framework runtime, and `lit` is its only dependency. The `@interactive-learning/vue` package and the `/react` and `/svelte` adapters are removed. Vue, React 19 and Svelte 5 use the element directly.

The element class `InteractiveLearningElement` is exported, its properties are declared on the prototype so frameworks pass the `guide` object as a property, and `removeEventListener` is typed. `InteractiveLearningProps` describes the element for framework template types, and `dist/custom-elements.json` describes it for editors and catalogs. `TimelineController` and the guide helpers are exported from this package. An invalid JSON response reports a readable error.
