---
'@interactive-learning/player': patch
'@interactive-learning/recorder': patch
---

The player loads the screenshots ahead of the timeline: the one on screen first, then the next ones two at a time, with the next one decoded in advance, so a step changes without stopping on a loading screen. Loaded screenshots stay in memory, so a replay, a step back or a guide replaced after an edit shows them at once instead of downloading them again, whatever the cache headers of the server. Before the viewer presses Play, only the next screenshot loads. The bundled studio and extension play guides this way too.
