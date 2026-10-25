---
'@interactive-learning/recorder': minor
---

Command results, error messages, the bundled extension and the AI skill are now in English. `skill install --agent claude` and `skill install --agent codex` install the skill for Claude Code or Codex in one line. The skill now runs the recorder through npx, so users install nothing beforehand, writes guides into the public folder of the project with screenshots as separate files instead of base64, and explains how to preview a guide without a player in the project. `capture add --url` and `capture replace --url` record the address of the page, keeping a hash route such as `#/settings`, and `export --zip` writes an archive the browser extension imports.
