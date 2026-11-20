# @interactive-learning/player

## 0.4.0

### Minor Changes

- bb9a1cb: A guide can tell a story under its screenshots. Its `story` lists lines, each with the moment it starts (`atMs`), on its own timing rather than the steps'. The player shows the line of the moment under the screen and fades from one line to the next. The story stops while a marker is read and goes on with playback. A line that starts after the end is never told. The recorder keeps the story when it validates a guide.

## 0.3.0

### Minor Changes

- b3e733d: Hosts that drive the player with their own controls, such as an editor with a timeline, get three things: `hide-controls` removes the control bar, and two read-only properties follow the playback: `currentTime`, the time since the start of the guide in milliseconds, and `paused`, false while the guide plays.
- b3e733d: A step can show part of a tall screenshot with its new `viewport` field. The player scrolls between the parts of one screenshot, fades between screenshots, or swaps them at once when a step sets `transition: 'cut'`, and two screenshots of the same page fade in place before the scroll. The cursor waits where it last clicked while the page moves, then glides to its target, and the markers appear once it arrives. The next screenshot loads in advance.

### Patch Changes

- fcdcf63: The player loads the screenshots ahead of the timeline: the one on screen first, then the next ones two at a time, with the next one decoded in advance, so a step changes without stopping on a loading screen. Loaded screenshots stay in memory, so a replay, a step back or a guide replaced after an edit shows them at once instead of downloading them again, whatever the cache headers of the server. Before the viewer presses Play, only the next screenshot loads. The bundled studio and extension play guides this way too.

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
