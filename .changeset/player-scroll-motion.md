---
'@interactive-learning/player': minor
---

A step can show part of a tall screenshot with its new `viewport` field. The player scrolls between the parts of one screenshot, fades between screenshots, or swaps them at once when a step sets `transition: 'cut'`, and two screenshots of the same page fade in place before the scroll. The cursor waits where it last clicked while the page moves, then glides to its target, and the markers appear once it arrives. The next screenshot loads in advance.
