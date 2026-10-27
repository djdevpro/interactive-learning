---
'@interactive-learning/player': minor
---

Hosts that drive the player with their own controls, such as an editor with a timeline, get three things: `hide-controls` removes the control bar, and two read-only properties follow the playback: `currentTime`, the time since the start of the guide in milliseconds, and `paused`, false while the guide plays.
