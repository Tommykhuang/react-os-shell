---
bump: minor
title: Page tabs shrink like a browser's instead of scrolling
---

- **`PageTabBar`: many tabs shrink, the way a browser's tab strip does, instead
  of scrolling off the side.** Every tab asks for 15rem and all of them shrink
  evenly as more open, so twelve tabs fit a laptop-width strip. Each tab is a
  size container (`@container`) and gives detail up as it narrows: its title
  fades at the edge (a mask, not "…"), then an idle tab's × steps aside, then
  its title goes, down to the icon alone. The strip only scrolls once every
  tab is at its floor.

  - **Hovering any tab shows its ×**, however narrow — closing a page is always
    one click. The tab on screen keeps its × at every width.
  - A narrow idle tab with unsaved work shows its dot on the icon.
  - **Pinned tabs are icon-only** (their title stays available to assistive
    tech and as the tooltip); a pinned tab without an icon still shows its
    title.
  - A hairline separates two idle tabs; none sits beside the active one.

  Container-query classes (`@max-[6.5rem]:…`) need Tailwind v4, which the
  kit already requires.
