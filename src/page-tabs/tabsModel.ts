/**
 * The page-tabs state, as plain functions over plain data.
 *
 * Kept free of React and of the router so the rules that decide what a user
 * sees — which tab a click lands on, which one goes when there are too many,
 * what survives a reload — are tested directly rather than through a rendered
 * strip. `PageTabsProvider` holds a `TabsState` and calls these; nothing else
 * mutates one.
 *
 * A tab is an OPEN PAGE, identified by `key` (by default the page's pathname,
 * so `/orders?status=open` and `/orders?status=done` are the same tab showing
 * different filters, while `/orders/41` and `/orders/42` are two tabs — the
 * two windows the desktop used to give them). `path` is the full address the
 * tab was last at, which is where clicking it goes back to.
 */

export interface PageTab {
  /** Identity. Two addresses with the same key are the same tab. */
  key: string;
  /** Where the tab was last: pathname + search. Never the fragment — see
   *  `pathOf` in PageTabsProvider. */
  path: string;
  /** What the strip shows. The route's name until the page supplies its own
   *  (`usePageTabTitle`), after which navigation within the tab keeps it. */
  title: string;
  /** Who set `title`: the route table, or the page itself. */
  titleFrom: 'route' | 'page';
  /** Pinned tabs sit first and cannot be closed — a home page. */
  pinned: boolean;
  /** Recency, for choosing which tab to close when there are too many. A
   *  counter rather than a clock, so it is deterministic under test. */
  lastActive: number;
}

export interface TabsState {
  tabs: PageTab[];
  /** The tab on screen, or null while the address is not a tab at all (a
   *  redirect on its way somewhere, a page the consumer keeps out of tabs). */
  activeKey: string | null;
  /** Tabs rendered at least once this session. A tab restored from storage is
   *  not rendered until it is first opened — restoring ten tabs must not run
   *  ten pages' worth of rendering and chunk loading behind the one in view. */
  mounted: string[];
  /** Unsaved changes, by tab. Never persisted: a reload loses them anyway. */
  dirty: string[];
  /** A tab whose close is waiting for navigation to leave it. Closing the tab
   *  on screen is two updates — the state, and the address — and they do not
   *  land in the same render; the tab stays mounted (but out of the strip)
   *  until the address has moved, so the page never unmounts and remounts in
   *  between. */
  closing: string | null;
  /** Monotonic counter feeding `lastActive`. */
  clock: number;
}

export interface TabEntry {
  key: string;
  path: string;
  title: string;
}

export const DEFAULT_MAX_TABS = 12;

export function emptyState(): TabsState {
  return { tabs: [], activeKey: null, mounted: [], dirty: [], closing: null, clock: 0 };
}

const without = (list: string[], key: string) => list.filter((k) => k !== key);
const withKey = (list: string[], key: string) => (list.includes(key) ? list : [...list, key]);

/** Pinned first, in pin order; then the rest in the order they were opened. */
function orderPinned(tabs: PageTab[], pinnedKeys: string[]): PageTab[] {
  const pinned = pinnedKeys
    .map((key) => tabs.find((t) => t.key === key))
    .filter((t): t is PageTab => Boolean(t));
  return [...pinned, ...tabs.filter((t) => !pinnedKeys.includes(t.key))];
}

/**
 * The address moved to `entry`: activate its tab, opening one if needed.
 *
 * An existing tab takes the new address (a filter changed, a hash moved) and
 * keeps a title its page set. A new tab is appended — at the end, where the
 * strip's newest tab always is — and if that takes the count past `maxTabs`
 * the least recently used tab that can go does: not pinned, not on screen,
 * not holding unsaved changes. When nothing can go, the strip runs long
 * rather than throwing work away.
 */
export function visit(state: TabsState, entry: TabEntry, maxTabs = DEFAULT_MAX_TABS): TabsState {
  const clock = state.clock + 1;
  const existing = state.tabs.find((t) => t.key === entry.key);
  let tabs: PageTab[];
  if (existing) {
    tabs = state.tabs.map((t) =>
      t.key === entry.key
        ? {
            ...t,
            path: entry.path,
            title: t.titleFrom === 'page' ? t.title : entry.title || t.title,
            lastActive: clock,
          }
        : t,
    );
  } else {
    tabs = [
      ...state.tabs,
      { key: entry.key, path: entry.path, title: entry.title, titleFrom: 'route', pinned: false, lastActive: clock },
    ];
  }
  let next: TabsState = {
    ...state,
    tabs,
    activeKey: entry.key,
    mounted: withKey(state.mounted, entry.key),
    clock,
  };
  // A pending close completes once the address has left that tab.
  if (next.closing && next.closing !== entry.key) next = removeTab(next, next.closing);
  else if (next.closing === entry.key) next = { ...next, closing: null };
  return evictOverflow(next, maxTabs);
}

/** The address is not a tab (a redirect in flight, an excluded page). */
export function visitTransient(state: TabsState): TabsState {
  let next: TabsState = { ...state, activeKey: null };
  if (next.closing) next = removeTab(next, next.closing);
  return next;
}

function evictOverflow(state: TabsState, maxTabs: number): TabsState {
  let next = state;
  while (next.tabs.length > maxTabs) {
    const candidates = next.tabs
      .filter((t) => !t.pinned && t.key !== next.activeKey && !next.dirty.includes(t.key) && t.key !== next.closing)
      .sort((a, b) => a.lastActive - b.lastActive);
    if (candidates.length === 0) break;
    next = removeTab(next, candidates[0].key);
  }
  return next;
}

/** Drop a tab outright. Callers decide about unsaved changes first. */
export function removeTab(state: TabsState, key: string): TabsState {
  return {
    ...state,
    tabs: state.tabs.filter((t) => t.key !== key),
    mounted: without(state.mounted, key),
    dirty: without(state.dirty, key),
    activeKey: state.activeKey === key ? null : state.activeKey,
    closing: state.closing === key ? null : state.closing,
  };
}

/**
 * Where to go when the tab on screen closes: the tab to its right, else the
 * one to its left — the browser's rule, so the strip does not jump.
 */
export function neighbourOf(state: TabsState, key: string): PageTab | null {
  const visible = state.tabs.filter((t) => t.key !== state.closing || t.key === key);
  const i = visible.findIndex((t) => t.key === key);
  if (i < 0) return null;
  return visible[i + 1] ?? visible[i - 1] ?? null;
}

/** Mark the tab on screen as closing; it goes when the address moves on. */
export function beginClose(state: TabsState, key: string): TabsState {
  return { ...state, closing: key };
}

/** The keys a bulk close would take, before any unsaved-changes check. */
export function keysToClose(
  state: TabsState,
  scope: 'others' | 'right' | 'all',
  key: string | null,
): string[] {
  const closable = state.tabs.filter((t) => !t.pinned);
  if (scope === 'all') return closable.map((t) => t.key);
  if (scope === 'others') return closable.filter((t) => t.key !== key).map((t) => t.key);
  const i = state.tabs.findIndex((t) => t.key === key);
  if (i < 0) return [];
  return state.tabs.slice(i + 1).filter((t) => !t.pinned).map((t) => t.key);
}

export function setTitle(state: TabsState, key: string, title: string): TabsState {
  const tab = state.tabs.find((t) => t.key === key);
  if (!tab || !title || (tab.title === title && tab.titleFrom === 'page')) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.key === key ? { ...t, title, titleFrom: 'page' } : t)),
  };
}

export function setDirty(state: TabsState, key: string, dirty: boolean): TabsState {
  const has = state.dirty.includes(key);
  if (dirty === has) return state;
  return { ...state, dirty: dirty ? [...state.dirty, key] : without(state.dirty, key) };
}

/**
 * Make sure every pinned tab exists and they lead the strip.
 *
 * Runs on every start, so a home page added to `pinned` after a user's tabs
 * were saved still appears, and one removed from it stops being pinned (it
 * stays open as an ordinary tab rather than vanishing under the user).
 */
export function ensurePinned(state: TabsState, pinned: TabEntry[]): TabsState {
  const pinnedKeys = pinned.map((p) => p.key);
  let tabs = state.tabs.map((t) => ({ ...t, pinned: pinnedKeys.includes(t.key) }));
  for (const p of pinned) {
    if (!tabs.some((t) => t.key === p.key)) {
      tabs = [...tabs, { key: p.key, path: p.path, title: p.title, titleFrom: 'route', pinned: true, lastActive: 0 }];
    }
  }
  return { ...state, tabs: orderPinned(tabs, pinnedKeys) };
}

// ── Persistence ────────────────────────────────────────────────────────────

/** What survives a reload: which pages were open, where, and what they were
 *  called. Not the page state — that is the page's to restore. */
interface StoredTabs {
  v: 1;
  tabs: { key: string; path: string; title: string; titleFrom: 'route' | 'page' }[];
}

export function serialize(state: TabsState): string {
  const stored: StoredTabs = {
    v: 1,
    tabs: state.tabs
      .filter((t) => t.key !== state.closing)
      .map(({ key, path, title, titleFrom }) => ({ key, path, title, titleFrom })),
  };
  return JSON.stringify(stored);
}

/**
 * Read saved tabs back, re-deciding each one against today's routes.
 *
 * `resolve` is the consumer's route table: a saved page that is no longer a
 * tab (retired, renamed, now excluded) is dropped, and one whose key rule
 * changed takes its new key. Anything unreadable yields no tabs — a corrupt
 * entry must not stop the portal from starting.
 */
export function restore(raw: string | null, resolve: (path: string) => TabEntry | null): PageTab[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const stored = parsed as Partial<StoredTabs> | null;
  if (!stored || stored.v !== 1 || !Array.isArray(stored.tabs)) return [];
  const out: PageTab[] = [];
  for (const item of stored.tabs) {
    // An app path only. `//host/…` is protocol-relative: another origin.
    if (!item || typeof item.path !== 'string' || !item.path.startsWith('/') || item.path.startsWith('//')) continue;
    // A fragment is never kept (see `pathOf`); drop one a hand-edited or
    // foreign value carries on the way in.
    const hashAt = item.path.indexOf('#');
    const path = hashAt >= 0 ? item.path.slice(0, hashAt) : item.path;
    const entry = resolve(path);
    if (!entry || out.some((t) => t.key === entry.key)) continue;
    const pageTitle = item.titleFrom === 'page' && typeof item.title === 'string' && item.title;
    out.push({
      key: entry.key,
      path,
      title: pageTitle || entry.title,
      titleFrom: pageTitle ? 'page' : 'route',
      pinned: false,
      lastActive: 0,
    });
  }
  return out;
}
