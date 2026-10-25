---
'@interactive-learning/player': minor
---

Every player text is now configurable. The interface ships English and French, follows the nearest `lang` attribute and falls back to English. Use the `locale` and `messages` props in Vue, or the `lang` attribute and `messages` property on `<interactive-learning>`.

The player now has light and dark themes. It starts from the operating system preference, and a bulb button that replaces the information button switches between light and dark. The controls and tooltips sit on a veil of the theme color and take the inverse colors, dark on a white veil in the light theme and light on a dark veil in the dark theme. The `theme` prop and attribute (`light`, `dark` or `system`) and the `theme-change` event control it. `show-information` stays available as a plain option, and the `information-change` event is removed.

The default look is plain, with square corners and the page font. Theme properties such as `--il-accent`, `--il-radius` and `--il-font` can be set on any ancestor, including the custom element. While playing, the controls fade out after a moment without pointer activity and a thin progress line remains. The cursor stops just below a marker instead of covering it, and an open tooltip fades the screenshot. Validation and playback engine errors are now in English.
