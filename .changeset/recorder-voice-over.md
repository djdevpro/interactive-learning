---
'@interactive-learning/recorder': minor
---

The recorder gives a guide its voice-over. `addVoiceOver` has ElevenLabs read each line of the story aloud and writes on each line the `audio` and the `words` that the player plays and shows as captions. A line already read is kept next to the guide under a name that follows from its text, its voice and its model, so it is never billed twice. Steps get longer where a line lasts longer than them, so the voice always ends before the next line. The key comes from `ELEVENLABS_API_KEY`; without it, new lines stay silent.
