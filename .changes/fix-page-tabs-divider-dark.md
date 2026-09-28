---
bump: patch
title: PageTabBar hairline follows the dark theme
---

- **`PageTabBar`: the hairline between two idle tabs no longer shows as a
  bright bar in the dark theme.** It was filled with `bg-gray-300`, which the
  dark sheet does not remap, so on the dark strip it kept the light gray-300.
  It is now a `border-l border-gray-300` hairline. The light theme looks the
  same, and in dark the line takes `--line-strong` like the kit's other strong
  lines. The pink, green, grey and blue themes now tint it with their own line
  colour, as they already tint the strip and the active tab's edge.
