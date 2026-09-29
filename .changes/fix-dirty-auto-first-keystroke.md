---
bump: patch
title: A dialog inside a window keeps the first key typed into it
---

- **The first key typed into a dialog opened inside a window is no longer
  lost.** Open a create form from a list window (a `<Modal dirty="auto">`
  with no `windowKey`), click a controlled field such as a `SearchableSelect`,
  type `4`: the field stayed empty, and only the second key landed. It happened
  once per dialog, to whichever controlled field was typed into first.

  `dirty="auto"` hears `input` in the capture phase, before React's own
  `onChange`. The first key flips the dialog dirty, and since 4.107.0 the
  dialog reports that to the window around it, which re-renders the form. A
  plain `setState` from a native listener renders in the microtask straight
  after that listener, while React still has not read the key, so every
  controlled input went back to its old value.

  The flag is now set in a ref at once, and the state that reports it renders
  one timer turn later, after the event. The dialog's own close guard reads the
  ref, so a key followed straight away by Escape still asks before discarding.
  The window around the dialog asks as before, once that turn has passed.

  The real-browser lane has a new check, `nestedDialogFirstKeystroke`, covering
  the first key and an immediate Escape. jsdom never showed the bug, because the
  microtask checkpoint between two listeners only happens when the browser
  dispatches the event itself.
