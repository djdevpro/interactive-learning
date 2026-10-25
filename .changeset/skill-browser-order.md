---
'@interactive-learning/recorder': patch
---

The AI skill now takes screenshots with the browser built into the agent's harness first. Only when the harness has none, or when its screenshots never reach the agent as files, does it use Playwright: the copy the project already depends on, or one installed in a temporary folder outside the project after telling the user. The Playwright script only drives the browser and is never written as a test. At the end of its work, the agent offers to open the guide in the studio and starts it in the background when the user accepts.
