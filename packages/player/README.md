# @interactive-learning/player

The interactive guide player, `<interactive-learning>`. It plays a guide made of real screenshots with an animated cursor, numbered markers and playback controls.

It is a standard Web Component written with [Lit](https://lit.dev), so it works in plain HTML and in every framework that supports custom elements, such as Vue, React 19, Svelte 5, Angular or Solid. The package contains no framework code, and `lit` is its only dependency. `dist/custom-elements.json` describes the element for editors and component catalogs.

## Install

```sh
npm install @interactive-learning/player
```

```sh
pnpm add @interactive-learning/player
```

## HTML

```html
<interactive-learning src="/guides/sign-up/guide.json"></interactive-learning>
<script type="module">
  import '@interactive-learning/player/auto';
</script>
```

This bare import needs a bundler or an import map. For a page without a build step, load the module from a CDN that resolves dependencies, for example `https://cdn.jsdelivr.net/npm/@interactive-learning/player/dist/auto.js/+esm`.

`src` downloads and validates the guide, and relative images resolve from its final URL. You can also assign a guide object.

```ts
import { registerInteractiveLearning, validateGuide } from '@interactive-learning/player';

registerInteractiveLearning();
const player = document.querySelector('interactive-learning')!;
player.guide = validateGuide(json);
player.assetBaseUrl = '/guides/sign-up/';
player.addEventListener('guide-load', () => player.play());
player.addEventListener('step-change', (event) => console.log(event.detail.index));
```

`guide` is a JavaScript property, never JSON inside an attribute, and it wins over `src`. Assign a new object to reload, and do not mutate the current one. Changing the source cancels the previous download. URLs on another origin must allow CORS.

## Frameworks

The element declares its properties on its prototype. A framework therefore finds them as soon as it creates the tag, before the tag enters the page, and passes objects as properties rather than as attributes. Register the element once before the first render with `import '@interactive-learning/player/auto'`. Listen to events with the `on<event>` convention of custom elements, or `@event` in Vue.

`InteractiveLearningProps` describes the properties and listeners without depending on any framework. Declare it once in a React or Svelte application to get autocompletion and type checking.

### Vue

Tell the Vue compiler that the tag is a custom element, in `vite.config.ts`.

```ts
vue({
  template: { compilerOptions: { isCustomElement: (tag) => tag === 'interactive-learning' } },
});
```

```vue
<script setup lang="ts">
import '@interactive-learning/player/auto';
</script>

<template>
  <interactive-learning
    src="/guides/sign-up/guide.json"
    @step-change="(event) => console.log(event.detail.index)"
  />
</template>
```

Bind an object with `:guide.prop="guide"`. A template ref gives the element and its methods.

### React 19

```tsx
import '@interactive-learning/player/auto';

export function Guide() {
  return (
    <interactive-learning
      src="/guides/sign-up/guide.json"
      onstep-change={(event) => console.log(event.detail.index)}
    />
  );
}
```

```ts
// src/interactive-learning.d.ts
import type { HTMLAttributes, RefAttributes } from 'react';
import type {
  InteractiveLearningElement,
  InteractiveLearningProps,
} from '@interactive-learning/player';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'interactive-learning': HTMLAttributes<InteractiveLearningElement> &
        RefAttributes<InteractiveLearningElement> &
        InteractiveLearningProps;
    }
  }
}
```

A `ref` gives the element and its methods. React 18 passes neither object properties nor custom events to custom elements, so use a `ref` and `addEventListener` there.

### Svelte 5

```svelte
<script lang="ts">
  import '@interactive-learning/player/auto';
</script>

<interactive-learning
  src="/guides/sign-up/guide.json"
  onstep-change={(event) => console.log(event.detail.index)}
></interactive-learning>
```

```ts
// src/interactive-learning.d.ts
import type { HTMLAttributes } from 'svelte/elements';
import type {
  InteractiveLearningElement,
  InteractiveLearningProps,
} from '@interactive-learning/player';

declare module 'svelte/elements' {
  export interface SvelteHTMLElements {
    'interactive-learning': HTMLAttributes<InteractiveLearningElement> & InteractiveLearningProps;
  }
}
```

`bind:this` gives the element and its methods.

## Element reference

| API                                    | Description                                         |
| -------------------------------------- | --------------------------------------------------- |
| `guide`                                | Property. Validated guide object, wins over `src`   |
| `src`                                  | Property and attribute. URL of the guide JSON       |
| `assetBaseUrl` / `asset-base-url`      | Prefix for relative image paths                     |
| `showInformation` / `show-information` | Titles and descriptions, hidden by default          |
| `theme`                                | Property and attribute. `light`, `dark` or `system` |
| `messages`                             | Property. Replaces any built-in text                |
| `lang`                                 | Interface language, inherited from the page         |
| `play()`, `pause()`                    | Playback commands                                   |
| `seek(milliseconds)`                   | Absolute position                                   |
| `goToStep(index)`                      | Step, zero based                                    |
| `seekToStep(index)`                    | Step, then pause                                    |
| `step-change`                          | Event with `detail.index` and `detail.step`         |
| `theme-change`                         | Event with `detail.theme`, after the bulb button    |
| `guide-load`                           | Event with `detail.guide`, once the player is ready |
| `guide-error`                          | Event with `detail.message`, already translated     |

`show-information` and `theme` reflect their attribute. The bulb button updates `theme` before it fires `theme-change`, so you can store the viewer choice. A boolean attribute is on when present, so remove it or set the property to `false` to turn it off.

Events bubble and cross the Shadow DOM boundary. Commands work after `guide-load`, and Play waits for the first image by itself. Moving the element in the page keeps the playback position, and removing it frees the player.

## Behavior

The player waits for each screenshot to load before it moves on, and pauses with a retry button when an image fails. The cursor glides to the click position and stops just below a marker instead of covering it. Markers appear one after another and keep a 40 px hit area. A marker that would sit under the controls moves up, with a line back to its true position, and the guide coordinates stay unchanged.

Pressing a marker pauses playback and opens its tooltip, which fades the screenshot behind it. Closing the tooltip resumes playback when the marker interrupted it. Esc closes the tooltip, then leaves full screen.

While a guide plays, the controls fade out after a short time without pointer movement and a thin progress line stays visible. Moving the pointer, touching the player or focusing a control with the keyboard brings them back.

On the focused player, Space plays or pauses, the arrow keys change step, and Home and End jump to the start or the end. The speed button cycles through 1×, 1.5× and 2× without changing the durations stored in the guide. Reduced motion preferences turn every animation off.

## Language and texts

The element ships English and French. It follows its own `lang` attribute, then the nearest one in the page, then falls back to English. `<interactive-learning lang="fr">` or `<html lang="fr">` both give French, and changing the element's `lang` updates the interface.

The `messages` property replaces any text, including the loading and error texts. Texts that contain values are functions.

```ts
import { playerMessages, type PlayerMessages } from '@interactive-learning/player';

player.messages = { play: 'Start the tour' };

const spanish: PlayerMessages = { ...playerMessages.en, play: 'Reproducir la guía' /* … */ };
player.lang = 'es';
player.messages = spanish;
```

## Theme

The theme starts from the operating system preference, and the bulb button switches between light and dark. A veil of the theme color fades the screenshot behind the controls and open tooltips, which take the inverse colors. In the light theme, the controls and tooltips are dark on a white veil. In the dark theme, they are light on a dark veil.

The Shadow DOM isolates the player styles from the page. CSS custom properties still pass through, so set them on the element or on any ancestor.

```css
interactive-learning {
  --il-accent: #2563eb;
  --il-radius: 12px;
}
```

| Property       | Role                                    | Default                |
| -------------- | --------------------------------------- | ---------------------- |
| `--il-accent`  | Markers, start button and progress      | `#2f3542`              |
| `--il-font`    | Font family                             | The page font          |
| `--il-ink`     | Text                                    | Dark or light by theme |
| `--il-muted`   | Secondary text                          | Dark or light by theme |
| `--il-paper`   | Background                              | White or dark by theme |
| `--il-surface` | Image placeholder and hover backgrounds | Light or dark by theme |
| `--il-focus`   | Keyboard focus ring                     | Accent or white        |
| `--il-radius`  | Corner radius                           | `0px`, square corners  |

The default look is plain, with square corners, a neutral accent and the page font.

## Other exports

- `InteractiveLearningElement` is the element class, and `registerInteractiveLearning()` defines the tag once per page.
- `createGuide`, `validateGuide`, `GuideValidationError` and `SCHEMA_VERSION` handle the guide format.
- `TimelineController` is the playback engine. It works without the DOM and creates no timer.
- `playerMessages` holds the built-in texts.

## Server rendering and CSP

Importing the package on a server is safe, because Lit provides a server build. The element renders in the browser only, so a server can output the empty tag but not its content. Styles use constructable stylesheets. In browsers without them, `registerInteractiveLearning({ nonce })` adds a nonce to the injected styles for a Content Security Policy. Registration happens once per page, and a page must load a single version of the player.

## Develop

`pnpm dev` in this package opens a live preview on <http://127.0.0.1:4316>. It plays the example guide next to settings for the theme, language, colors and source, with a log of the events. Every change in `src/` reloads the page.

## License

MIT
