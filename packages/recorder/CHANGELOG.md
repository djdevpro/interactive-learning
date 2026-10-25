# @interactive-learning/recorder

## 0.2.0

### Minor Changes

- 3df2356: Command results, error messages, the bundled extension and the AI skill are now in English. `skill install --agent claude` and `skill install --agent codex` install the skill for Claude Code or Codex in one line. The skill now runs the recorder through npx, so users install nothing beforehand, writes guides into the public folder of the project with screenshots as separate files instead of base64, and explains how to preview a guide without a player in the project. `capture add --url` and `capture replace --url` record the address of the page, keeping a hash route such as `#/settings`, and `export --zip` writes an archive the browser extension imports.
- 2521adb: `studio --guide <guide.json>` opens a guide in the browser to finish it by hand, with the step editor of the extension and a live preview of the player. Each save writes `guide.json` and its images in place, and refuses to overwrite a file that changed on disk meanwhile. The studio listens on 127.0.0.1 only and answers only to the address it prints. `startStudio` exposes the same server to scripts.
