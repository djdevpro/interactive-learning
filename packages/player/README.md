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
| `showAddress` / `show-address`         | Page address of each step, hidden by default        |
| `frame`                                | `browser`: a macOS browser window around the video  |
| `muted`                                | Voice of the story off at the start                 |
| `hideControls` / `hide-controls`       | No control bar, for a host with its own controls    |
| `theme`                                | Property and attribute. `light`, `dark` or `system` |
| `messages`                             | Property. Replaces any built-in text                |
| `lang`                                 | Interface language, inherited from the page         |
| `play()`, `pause()`                    | Playback commands                                   |
| `seek(milliseconds)`                   | Absolute position                                   |
| `goToStep(index)`                      | Step, zero based                                    |
| `seekToStep(index)`                    | Step, then pause                                    |
| `currentTime`                          | Time since the start of the guide, in ms, read-only |
| `paused`                               | False while the guide plays, read-only              |
| `step-change`                          | Event with `detail.index` and `detail.step`         |
| `theme-change`                         | Event with `detail.theme`, after the bulb button    |
| `guide-load`                           | Event with `detail.guide`, once the player is ready |
| `guide-error`                          | Event with `detail.message`, already translated     |

`frame="browser"` shows the video in a browser window of macOS, with its three lights and the address of the page of each step in the title bar, as Safari shows it; the info button then has nothing to toggle and steps aside. Full screen shows the screenshot alone. `show-information`, `show-address`, `frame`, `muted` and `theme` reflect their attribute. When steps record the address of their page, an info button next to the bulb shows or hides it above the screenshot. The bulb button updates `theme` before it fires `theme-change`, so you can store the viewer choice. A boolean attribute is on when present, so remove it or set the property to `false` to turn it off.

Events bubble and cross the Shadow DOM boundary. Commands work after `guide-load`, and Play waits for the first image by itself. Moving the element in the page keeps the playback position, and removing it frees the player.

## Behavior

The player loads the screenshot on screen first, then the next ones in order, two at a time, and decodes the next one in advance, so a step changes without a pause. Before the viewer presses Play, only the next screenshot loads, which keeps a page of guides light. Loaded screenshots stay in memory: a replay, a step back or a new guide object with the same images shows them at once, whatever the cache headers of the server. A screenshot that is not ready yet holds the guide until it arrives, and an image that fails pauses the guide with a retry button. The cursor glides to the click position and stops just below a marker instead of covering it.

A step can show part of a tall screenshot: its `viewport` gives that part as fractions of the image, for example `{ "x": 0, "y": 0.4, "width": 1, "height": 0.25 }`, while its cursor and markers keep their positions on the whole image. Between two steps on the same screenshot, the player scrolls from one part to the other. A new screenshot fades in, or replaces the previous one at once when the step sets `"transition": "cut"`. Two screenshots of the same page, captured at the same width, fade in place before the scroll. The cursor waits where it last clicked while the page moves, then glides to its target, and the markers of the step appear once it arrives. Markers appear one after another and keep a 40 px hit area. A marker that would sit under the controls moves up, with a line back to its true position, and the guide coordinates stay unchanged.

A step can zoom toward its click, as screen recording software does: with `"zoom": 1.6`, the camera closes in on the point of the cursor while the cursor gets there, stays close through the click, then goes back before the markers appear. It centers the point as far as the screenshot allows, and the screenshot stays sharp, since the player draws it at the size on screen. Keep zooms for a few clicks, on a small target or a key action. A step without a cursor, or with less than about a second after the click, does not zoom, and reduced motion turns zooms off.

Pressing a marker pauses playback and opens its tooltip, which fades the screenshot behind it. Closing the tooltip resumes playback when the marker interrupted it. Esc closes the tooltip, then leaves full screen.

A guide can tell a story under its screenshots, on its own timing rather than the steps'. Its `story` lists lines in the order they are told, each with the moment it starts, in milliseconds from the start of the guide: `"story": [{ "atMs": 0, "text": "The group has three companies." }, { "atMs": 9000, "text": "Each keeps its own accounts." }]`. The player shows one line at a time under the screen, from its start until the next line or the end of the guide. A line that starts after the last step is never told. The story follows playback: it stops while a marker is open and goes on with the guide.

A line can also be read aloud, like the voice over of a video: its `audio` names a sound file next to the guide, as the screenshots are, or holds an embedded one, such as `{ "atMs": 0, "text": "The group has three companies.", "audio": "voice/intro.mp3" }`. The voice plays from the start of its line while the guide plays, at its speed, pauses with it and follows a seek. Keep each voice shorter than its line, since the next line stops it. A speaker button next to the bulb turns the voice off and on, and `muted` starts without it. Browsers play sound only once the viewer has acted on the page, and pressing Play counts.

A voiced line can also list its `words`, each with the moment the voice says it, in milliseconds from the start of the line: `"words": [{ "text": "Deuxième", "atMs": 0, "endMs": 360 }, …]`. The player then shows them over the screen as the captions of a video: a few words at a time, cut at the end of a sentence, at a comma once a chunk holds three words, or at a pause of the voice, each word lit when it is said. They sit at the bottom, above the controls, in white with a dark outline, and their size follows the player. When every line has its words, the story under the screen gives way to them, and screen readers still get each line.

The camera frames each step. When the cursor or a marker sits low on screen, where the captions and the controls are, it closes in, up to 1.45 times, and moves down to lift the action toward the middle, never past the screenshot; between two steps it glides from one framing to the next. The arrow, the markers and the click ripple shrink with a narrow player, down to 60 % below 880 px wide, and keep their place on the screenshot.

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

| Property              | Role                                    | Default                |
| --------------------- | --------------------------------------- | ---------------------- |
| `--il-accent`         | Markers, start button and progress      | `#2f3542`              |
| `--il-font`           | Font family                             | The page font          |
| `--il-ink`            | Text                                    | Dark or light by theme |
| `--il-muted`          | Secondary text                          | Dark or light by theme |
| `--il-paper`          | Background                              | White or dark by theme |
| `--il-surface`        | Image placeholder and hover backgrounds | Light or dark by theme |
| `--il-focus`          | Keyboard focus ring                     | Accent or white        |
| `--il-radius`         | Corner radius                           | `0px`, square corners  |
| `--il-screen-padding` | Room around the video                   | `12px`, `0` full width |
| `--il-max-width`      | Widest the player grows, centered       | `1100px`, `none`       |

The default look is plain, with square corners, a neutral accent and the page font. The video keeps 12 px of room on each side, 8 px at most in a narrow player and none in full screen; `--il-screen-padding: 0` runs it to the edges.

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
