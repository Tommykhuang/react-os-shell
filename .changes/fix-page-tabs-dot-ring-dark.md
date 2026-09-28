---
bump: patch
title: ring-gray-100 follows the dark theme
---

- **`ring-gray-100` now has a dark remap, to `--surface`.** It is the ring
  that cuts `PageTabBar`'s unsaved dot out of a narrow idle tab's icon in the
  strip's colour. With no remap it kept the light gray-100, so in dark the dot
  wore a pale halo on the dark strip. It now takes the token `bg-gray-100`
  maps to, so the cut-out matches the strip again.

  This is the kit's first `ring-*` remap. It sets Tailwind's `--tw-ring-color`
  rather than a colour property, so it reaches any `ring-gray-100` a consumer
  draws, and in dark that ring matches a `bg-gray-100` or `bg-white` surface.
  Nothing else in the kit or the EFFICIENT portals uses the class today.
