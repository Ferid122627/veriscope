---
name: Demo video recording
description: How the hackathon demo video is produced and what to keep consistent when re-recording
---
- The demo video is a real recording of the running app, not an animated mock: Chromium driven by playwright-core, frames from the DevTools screencast, an injected overlay for cursor, click ripples, captions and the dragged-file chip.
  **Why:** the user asked for a test video of the actual site with visible mouse clicks, PDF upload animation and real AI answers.
- Playwright's built-in recordVideo is too blurry at 1080p (fixed ~1 Mbps VP8); the screencast at deviceScaleFactor 1.25 on a 1536x864 viewport gives sharp 1920x1080 frames.
- Never press the real mouse while animating a file drag (it selects page text); fake the press in the overlay and dispatch a synthetic drop event with the File.
- AI waits (about 40 s for document analysis, a few seconds for reassessment) are sped up in assembly, with an on-screen "sped up" badge, never cut out silently.
- The user asked for a short video without dragging it out; the current cut is about 2.5 minutes with English captions matching the UI. Re-record from an empty database (reset script keeps user accounts).
