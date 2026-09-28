---
bump: minor
title: react-os-shell/page-tabs — open pages as tabs for a routed app
---

- **New subpath, `react-os-shell/page-tabs`: every page opened stays open as a
  tab, and the pages behind the other tabs stay alive.** A portal that left the
  desktop for routed pages lost what windows gave it — several records open at
  once, each keeping its place. Opening an order replaced the list it came
  from, with its filters, its scroll position and anything half typed. This
  puts that back in the shape admin dashboards use: a strip of tabs under the
  header, one per page opened.

  ```tsx
  <PageTabsProvider key={user.id} storageKey={`tabs:u${user.id}`}
                    resolve={(loc) => routeTitle(loc)} pinned={['/dashboard']}>
    <PageTabBar />
    <PageTabsOutlet frameClassName="min-h-0 flex-1 overflow-y-auto p-6">
      {(location) => <Routes location={location}>{contentRoutes}</Routes>}
    </PageTabsOutlet>
  </PageTabsProvider>
  ```

  - **The address stays the source of truth.** A tab is a location the
    consumer's `resolve` names; clicking one navigates to its last address, so
    Back, Forward, bookmarks and deep links behave as they did. `resolve`
    returning `null` (a redirect, an excluded page) opens no tab.
  - **Hidden pages are paused, not just hidden, on React 19.2+.** Each tab's
    page renders inside `<Activity>`, so a hidden list stops polling and a
    hidden form stops hearing ⌘S, then both resume when shown. React 18 has no
    Activity; there hidden pages are only hidden (`PAGE_TABS_PAUSE_HIDDEN`
    says which you got).
  - **The strip:** click to switch; ×, middle-click, or Delete on a focused
    tab to close; right-click for Close / Close other tabs / Close tabs to the
    right / Close all; arrow keys along it. Pinned tabs lead and cannot close.
    It can stand in for an app's header: `end` holds controls at its right
    (a connection light, a theme switch) that stay put while the tabs scroll,
    and the active tab takes the page's background so it reads as the top of
    the page (`activeClassName` for a page that is not `bg-gray-50`).
  - **A fragment is never remembered.** A tab keeps its path and query only,
    so a token handed over in `#…` (an impersonation hand-off, an OAuth
    grant) is not written to storage or put back in the address bar.
  - **Unsaved work asks first.** `usePageTabDirty(dirty)` marks a tab (a dot
    replaces its ×); closing it asks through the kit's `confirm` (mount
    `ConfirmProvider`, or pass `confirmDiscard`), and the browser tab asks
    before a reload. The mark survives the tab being hidden.
  - **Pages talk to their tab** with `usePageTabTitle(title)` (a record's
    number once loaded) and `usePageTab().close({ to, force })` (a form that
    created its record closes itself and opens the record). All hooks are
    no-ops outside a tab, so a page works unchanged with tabs off.
  - Open tabs survive a reload (`storageKey`); a restored tab renders only
    when first opened. Past `maxTabs` (12) the least recently used tab without
    unsaved work closes. Scroll positions inside a tab — its frame and any
    scrolling list in it — come back with it.

  Its own entry because it needs `react-router-dom`, which the kit must not;
  `scripts/verify-dist.mjs` holds its built graph to React, react-dom and the
  router. The strip's strings are a new `pageTabs` section of `ShellStrings`.
