---
'@interactive-learning/player': minor
'@interactive-learning/recorder': patch
---

A guide can tell a story under its screenshots. Its `story` lists lines, each with the moment it starts (`atMs`), on its own timing rather than the steps'. The player shows the line of the moment under the screen and fades from one line to the next. The story stops while a marker is read and goes on with playback. A line that starts after the end is never told. The recorder keeps the story when it validates a guide.
