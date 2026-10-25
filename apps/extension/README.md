# Interactive Learning recorder extension

A Chrome Manifest V3 extension built with WXT, Vue and TypeScript. It records a walkthrough while you click through a website and exports it as a guide.

## Use it

From the repository root, run `pnpm --filter @interactive-learning/extension build`. In Chrome, open `chrome://extensions`, turn on developer mode and load the `.output/chrome-mv3` folder of this application. The recorder package also ships the built extension, and `npx -y @interactive-learning/recorder extension path` prints its folder.

1. Open the website to document, then click the extension icon. A side panel opens on the right of that tab only, and its header shows the site it records.
2. Name the guide and press **Start recording**. Walk through the flow in the page.
3. Clicks, settled fields, scrolls and navigations on the same site produce screenshots, each with the address of its page. To keep a filled form, press **Capture step** before you submit.
4. Press **Finish**, then open a step. Click the screenshot to add as many numbered markers as you need, drag one to move it, and give each its text. The cursor clicks the first marker. Delete a marker with its trash button or the Delete key, and change the step title and page address. **Save step** keeps the changes and **Cancel** drops them.
5. Press **Export ZIP**. The archive holds `guide.json` and an `assets` folder with the screenshots. Unzip it in the public folder of a site and point the player to `guide.json`.

**Import** opens a ZIP made by the extension or by `interactive-learning export --zip`, so a guide prepared by an AI agent can be refined here. **New guide** deletes the current guide, so export it first.

Guides and images live in IndexedDB, and the session state in `chrome.storage.local`. No server or automation tool is involved. The service worker spaces screenshots at least 600 ms apart. A guide accepts 500 steps and 80 MB, and an image 12 MB.

## Access to the tab

The extension asks for no permanent access to websites. Chrome grants it access to a tab when you click its icon on that tab, and keeps it while you stay on the same site. The panel belongs to that tab and hides on the others, so it never shows a page it does not record. To record another tab, click the icon there. A navigation to another site pauses the recording, and a click on the icon gives access again.

The extension uses `activeTab`, `scripting`, `sidePanel`, `storage` and `webNavigation`.

## Guarantees and limits

- The observer never blocks or replays clicks and submissions. It does not collect field values apart from what the visible images show.
- A screenshot triggered by a click or a submission is asynchronous, so it may show the result of the action. Capturing every form before it is sent is not guaranteed.
- A click pointer is added only to a previous screenshot taken in the same document, URL, DOM revision, viewport, scroll and pixel ratio. Otherwise it is left out with a diagnostic. A screenshot during which this context changes is discarded.
- The recorded site must stay the active tab. Embedded frames are not observed. A continuous DOM animation can make a screenshot rejected as unstable.
- Screenshots can contain personal data. Use demo data or hide it before capturing. Page addresses keep no query string, and keep the fragment only when it is a route such as `#/settings`.
- Single page application navigations are observed through `webNavigation`. Changes without a URL change can be captured after a click or by hand.

## Internal messages

Messages use the `interactive-learning/recorder` channel with `state`, `start` with a `title` and the `tabId` of the panel, `pause`, `resume`, `capture`, `stop`, `discard`, `import`, `edit-step`, `retake` and `delete-step`. Observations from the content script use `observation`. Control commands are reserved for extension pages, and observations are limited to the session tab and its main frame. The reply is `{ ok: true, state }` or `{ ok: false, error }`.
