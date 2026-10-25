---
'@interactive-learning/recorder': patch
---

The bundled extension now records every page of the site where the recording started, so moving between `www.example.com` and `example.com` no longer pauses it. When Chrome withdraws its access to the tab, the panel says to click the extension icon, and that click resumes the recording by itself. Resume no longer reports another site when Chrome only hides the address of the page.
