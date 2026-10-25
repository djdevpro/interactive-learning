# Interactive Learning recorder extension

A Chrome Manifest V3 extension built with WXT, Vue and TypeScript. It records a walkthrough while you click through a website and exports it as a guide.

## Use it

From the repository root, run `pnpm --filter @interactive-learning/extension build`. In Chrome, open `chrome://extensions`, turn on developer mode and load the `.output/chrome-mv3` folder of this application. The recorder package also ships the built extension, and `npx -y @interactive-learning/recorder extension path` prints its folder. Installation is manual, and no package changes your browser by itself.

1. Open the website to document, then click the extension.
2. Name the guide and start. Close the popup to walk through the flow.
3. Clicks, settled fields, scrolls and navigations on the same site produce screenshots.
4. To keep a filled form, open the popup and click **Capture this step** before you submit.
5. Finish, then export the JSON file. It contains the PNG images, and the player reads it directly. Code or the AI skill can then improve texts and markers.

Images and guides live in IndexedDB and the session state in `chrome.storage.local`. No server or automation tool is involved. The service worker spaces screenshots at least 600 ms apart. This prototype accepts 500 steps and 80 MB per guide, and 12 MB per image. Export the current guide before you start another one.

## Guarantees and limits

- The observer never blocks or replays clicks and submissions. It does not collect field values apart from what the visible images show.
- A screenshot triggered by a click or a submission is asynchronous, so it may show the result of the action. Capturing every form before it is sent is not guaranteed.
- A click pointer is added only to a previous screenshot taken in the same document, URL, DOM revision, viewport, scroll and pixel ratio. Otherwise it is left out with a diagnostic. A screenshot during which this context changes is discarded.
- The recorded site must stay the active tab. Navigating to another origin pauses the recording. The extension uses `activeTab`, `scripting`, `storage` and `webNavigation`, without permanent access to every site.
- Embedded frames are not observed. Their visible pixels can appear, but actions inside them create no step. A continuous DOM animation can make a screenshot rejected as unstable.
- Screenshots can contain personal data. Use demo data or hide it before capturing. The export removes the query string and fragment from the source URL.
- Single page application navigations are observed through `webNavigation`. Changes without a URL change can be captured after a click or by hand.

## Internal messages

Messages use the `interactive-learning/recorder` channel with `state`, `start` with a `title`, `pause`, `resume`, `capture` and `stop`. Observations from the content script use `observation`. Control commands are reserved for extension pages, and observations are limited to the session tab and its main frame. The reply is `{ ok: true, state }` or `{ ok: false, error }`.

The exported file follows the `GuideDocument` type of the internal `@interactive-learning/protocol` package, schema `1.0.0`.
