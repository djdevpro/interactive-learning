---
'@interactive-learning/recorder': minor
---

`studio --guide <guide.json>` opens a guide in the browser to finish it by hand, with the step editor of the extension and a live preview of the player. Each save writes `guide.json` and its images in place, and refuses to overwrite a file that changed on disk meanwhile. The studio listens on 127.0.0.1 only and answers only to the address it prints. `startStudio` exposes the same server to scripts.
