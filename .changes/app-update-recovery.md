---
bump: minor
title: Stale-chunk reload and an app-update banner
---

- **`installStaleChunkReload()` — a tab that outlived a deploy reloads instead
  of crashing.** A Vite build names every lazy chunk by its content hash, and a
  deploy replaces the whole `assets/` directory. A tab opened before the deploy
  still runs the old entry, and the first lazy window it opens asks for a chunk
  the server no longer has: the SPA fallback answers with `index.html`, the
  browser refuses that as a module, and the window crashes with "Failed to
  fetch dynamically imported module". Nothing inside the page can satisfy that
  import — only a fresh document, which names the new chunks, can.

  Vite dispatches `vite:preloadError` on `window` for exactly this failure.
  The installer listens for it, swallows the throw and reloads the page — once
  per 30-second cooldown, remembered in `sessionStorage` so it survives the
  reload it guards. A chunk that is STILL missing after the reload (a broken
  deploy, an offline network) is let through to the boundary, so a real
  outage is a visible crash and not a reload loop that eats the user's open
  windows. Call it once in `main.tsx`, before the app mounts; it takes
  `cooldownMs`, `reload`, `storage` and `now` for a host that needs to test it.

- **`AppUpdateBanner` and `useAppUpdate` — "A new version is available"
  without a service worker.** The other half of the same problem: a tab left
  open all day keeps running the bundle it loaded, fixes land silently hours
  late, and people report bugs that are already fixed. The hook polls the
  `version.json` a build emits beside its bundle — a fetch a minute from a
  visible tab, none from a hidden one, and one more the moment a hidden tab is
  shown again, since the tab that sat in the background all afternoon is the
  one that missed the deploy — and reports the deployed version once it
  differs from `currentVersion`. Polling stops once an update is known.

  The banner renders nothing until then, and then a warning `Banner` pinned at
  the top centre of the viewport above every window: the catalog's
  `update.available` line, both versions (`2.27.0 → 3.0.0`), and a primary
  "Refresh now" that reloads (or calls `onRefresh`). `versionUrl`, `pollMs`
  and `message` are props. Both are kit exports, so a `react-os-shell/ui`
  consumer with its own routed pages gets them too. Two new strings in the
  catalog: `update.available`, `update.refreshNow`.

- **`WindowCrashedFallback` offers "Reload page" for a missing chunk.** Its
  "Reload window" resets the boundary and remounts the content — which, for a
  chunk the server no longer serves, re-imports the same missing file and
  crashes again. For that error (`isStaleChunkError`, exported) the fallback
  now explains that a new version was deployed while the tab was open and
  offers a document reload, the one recovery that works. Every other crash is
  unchanged.
