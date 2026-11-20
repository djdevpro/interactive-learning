# @interactive-learning/recorder

## 0.3.0

### Minor Changes

- 7a10eea: The studio and the bundled extension set the duration and the transition of each step, and for a step that shows part of a tall screenshot, a frame on the image moves the part shown on screen. Guides accept the optional `viewport` and `transition` fields of a step.

### Patch Changes

- 565743a: The bundled extension has a **Preview** button next to **Export ZIP**. It plays the guide in the player, in a window beside the recorded tab, and shows the edits saved in the panel at once.
- 38aaaea: The bundled extension now records every page of the site where the recording started, so moving between `www.example.com` and `example.com` no longer pauses it. When Chrome withdraws its access to the tab, the panel says to click the extension icon, and that click resumes the recording by itself. Resume no longer reports another site when Chrome only hides the address of the page.
- fcdcf63: The player loads the screenshots ahead of the timeline: the one on screen first, then the next ones two at a time, with the next one decoded in advance, so a step changes without stopping on a loading screen. Loaded screenshots stay in memory, so a replay, a step back or a guide replaced after an edit shows them at once instead of downloading them again, whatever the cache headers of the server. Before the viewer presses Play, only the next screenshot loads. The bundled studio and extension play guides this way too.
- 393988e: The AI skill now takes screenshots with the browser built into the agent's harness first. Only when the harness has none, or when its screenshots never reach the agent as files, does it use Playwright: the copy the project already depends on, or one installed in a temporary folder outside the project after telling the user. The Playwright script only drives the browser and is never written as a test. At the end of its work, the agent offers to open the guide in the studio and starts it in the background when the user accepts.
- 3992129: The AI skill now makes the tutorial in Interactive Learning Studio when the studio is connected to the agent through its MCP server. The agent finds or creates the site in the library of the user, records the flow in the browser of the studio, writes the texts and markers, and publishes it to the project, while the user watches. The tutorial stays in the library, where the user comes back to it. Without the studio, the skill keeps the command line workflow.

## 0.2.0

### Minor Changes

- 3df2356: Command results, error messages, the bundled extension and the AI skill are now in English. `skill install --agent claude` and `skill install --agent codex` install the skill for Claude Code or Codex in one line. The skill now runs the recorder through npx, so users install nothing beforehand, writes guides into the public folder of the project with screenshots as separate files instead of base64, and explains how to preview a guide without a player in the project. `capture add --url` and `capture replace --url` record the address of the page, keeping a hash route such as `#/settings`, and `export --zip` writes an archive the browser extension imports.
- 2521adb: `studio --guide <guide.json>` opens a guide in the browser to finish it by hand, with the step editor of the extension and a live preview of the player. Each save writes `guide.json` and its images in place, and refuses to overwrite a file that changed on disk meanwhile. The studio listens on 127.0.0.1 only and answers only to the address it prints. `startStudio` exposes the same server to scripts.
