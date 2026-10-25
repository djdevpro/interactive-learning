# @interactive-learning/player

## 0.2.0

### Minor Changes

- 3df2356: Every player text is now configurable. The interface ships English and French, follows the nearest `lang` attribute and falls back to English. Use the `locale` and `messages` props in Vue, or the `lang` attribute and `messages` property on `<interactive-learning>`.

  The player now has light and dark themes. It starts from the operating system preference, and a bulb button that replaces the information button switches between light and dark. The controls and tooltips sit on a veil of the theme color and take the inverse colors, dark on a white veil in the light theme and light on a dark veil in the dark theme. The `theme` prop and attribute (`light`, `dark` or `system`) and the `theme-change` event control it. `show-information` stays available as a plain option, and the `information-change` event is removed.

  The default look is plain, with square corners and the page font. Theme properties such as `--il-accent`, `--il-radius` and `--il-font` can be set on any ancestor, including the custom element. While playing, the controls fade out after a moment without pointer activity and a thin progress line remains. The cursor stops just below a marker instead of covering it, and an open tooltip fades the screenshot. Validation and playback engine errors are now in English.

- 2521adb: Steps can record the address of their page. When they do, an info button next to the bulb shows it above the screenshot, and the `show-address` attribute shows it from the start. A hash route such as `#/settings` is kept in the address, while query strings are still dropped.
- 3df2356: Rebuild `<interactive-learning>` as a standard Web Component written with Lit. It is now the single implementation of the player, without any embedded framework runtime, and `lit` is its only dependency. The `@interactive-learning/vue` package and the `/react` and `/svelte` adapters are removed. Vue, React 19 and Svelte 5 use the element directly.

  The element class `InteractiveLearningElement` is exported, its properties are declared on the prototype so frameworks pass the `guide` object as a property, and `removeEventListener` is typed. `InteractiveLearningProps` describes the element for framework template types, and `dist/custom-elements.json` describes it for editors and catalogs. `TimelineController` and the guide helpers are exported from this package. An invalid JSON response reports a readable error.

### Patch Changes

- 3df2356: Keep annotation hit targets stationary during pointer presses. Animate only the visible marker so clicks held briefly open tooltips reliably, including with reduced motion enabled.
