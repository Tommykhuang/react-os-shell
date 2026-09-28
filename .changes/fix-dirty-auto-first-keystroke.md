---
bump: patch
title: A dialog inside a window keeps the first key typed into it
---

- **The first key typed into a dialog opened inside a window is no longer
  lost.** Open a create form from a list window (a `<Modal dirty="auto">`
  with no `windowKey`), click a field, type `4`: the field stayed empty, and
  only the second key landed. Every field in the dialog did it, but only once:
  whichever field was typed into first.

  `dirty="auto"` hears `input` in the capture phase, before React's own
  `onChange`. The first key flips the dialog dirty, and since 4.107.0 the
  dialog reports that to the window around it, which re-renders the form. A
  plain `setState` from a native listener renders in the microtask straight
  after that listener, while React still has not read the key, so every
  controlled input went back to its old value. The flip is now a transition
  and renders after the event. The dialog and the window around it still ask
  before discarding, as before.

  A check in the real-browser lane (`nestedDialogFirstKeystroke`) covers it.
  jsdom never showed the bug, because the microtask checkpoint between two
  listeners only happens when the browser dispatches the event itself.
