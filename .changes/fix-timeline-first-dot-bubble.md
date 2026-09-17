---
bump: patch
title: The first timeline dot's popover stays inside the card
---

- **The popover on a timeline's first dot no longer hangs off the left edge.**
  Hovering or focusing the milestone on the start day — `PO Placed` on a
  purchase order, `Project Initiated` on a mould — opened its popover centred
  on the card's left edge, with half of it cut off.

  The popover is clamped inside the track by a layout effect that re-ran when
  the open dot's position changed. That position reads `0` when no popover is
  open, and `0` again for the dot on the start day, so opening that one dot
  changed nothing the effect watched and the popover was never placed. The
  effect now also re-runs when the open dot itself changes. Every other dot
  was already placed correctly.
