/**
 * PageTabsProvider — keeps a strip of open pages in step with the router.
 *
 * A routed app shows one page at a time: open an order from a list and the
 * list is gone, with its filters, its scroll position and anything half typed.
 * The desktop shell answered that with windows; a portal that dropped the
 * desktop for plain pages lost it. Page tabs put it back the way admin
 * dashboards commonly do it: every page opened stays open as a tab under the
 * header, the pages behind the other tabs stay alive, and clicking a tab goes
 * back to exactly where it was.
 *
 * The address stays the source of truth. The provider never renders a page
 * the router did not route to: it watches the location, and a location its
 * `resolve` names becomes (or re-activates) a tab. Clicking a tab navigates to
 * that tab's last address, so Back, Forward, bookmarks and deep links behave
 * as they do without tabs. `PageTabsOutlet` does the keeping-alive and
 * `PageTabBar` draws the strip; this component is only the state between them.
 *
 * Mount it inside the router, once, keyed on the signed-in user:
 *
 *     <PageTabsProvider key={user.id} storageKey={`tabs:u${user.id}`} resolve={…}>
 *
 * The key matters. The saved strip belongs to one user, and a provider that
 * outlived a sign-out would show the next user the last one's pages.
 *
 * Unsaved changes ask before a tab closes (`usePageTabDirty` marks them) and
 * hold the browser tab open while they exist. The question is asked through
 * the kit's `confirm`, so `ConfirmProvider` must be mounted — or pass
 * `confirmDiscard` to ask some other way.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';

import { confirm } from '../shell/ConfirmDialog';
import { useShellStrings } from '../shell/strings';
import {
  PageTabsContext,
  type CloseTabOptions,
  type PageTabsContextValue,
  type ResolvePageTab,
  type TabLocation,
} from './context';
import {
  DEFAULT_MAX_TABS,
  beginClose,
  emptyState,
  ensurePinned,
  keysToClose,
  neighbourOf,
  removeTab,
  restore,
  serialize,
  setDirty as setDirtyIn,
  setTitle as setTitleIn,
  visit,
  visitTransient,
  type PageTab,
  type TabEntry,
  type TabsState,
} from './tabsModel';

export interface PageTabsProviderProps {
  children: ReactNode;
  /** The route table: whether an address is a tab, and what it is called. */
  resolve: ResolvePageTab;
  /** Addresses that are always open, first in the strip, and cannot be
   *  closed — the portal's home page. */
  pinned?: string[];
  /** localStorage key for the open tabs. Scope it to the user. Omit to keep
   *  tabs for the life of the page only. */
  storageKey?: string;
  /** Past this many, opening a page closes the least recently used tab that
   *  has no unsaved changes. */
  maxTabs?: number;
  /** Off, there is no strip and no keeping-alive: the outlet renders the
   *  current page alone. For phones, where a strip of tabs has no room. */
  enabled?: boolean;
  /** Ask before discarding unsaved changes. Defaults to the kit's `confirm`. */
  confirmDiscard?: (tabs: PageTab[]) => Promise<boolean>;
}

type Action =
  | { type: 'visit'; entry: TabEntry; maxTabs: number }
  | { type: 'transient' }
  | { type: 'close'; keys: string[]; closing: string | null }
  | { type: 'title'; key: string; title: string }
  | { type: 'dirty'; key: string; dirty: boolean };

function reducer(state: TabsState, action: Action): TabsState {
  switch (action.type) {
    case 'visit':
      return visit(state, action.entry, action.maxTabs);
    case 'transient':
      return visitTransient(state);
    case 'close': {
      let next = state;
      for (const key of action.keys) next = removeTab(next, key);
      return action.closing ? beginClose(next, action.closing) : next;
    }
    case 'title':
      return setTitleIn(state, action.key, action.title);
    case 'dirty':
      return setDirtyIn(state, action.key, action.dirty);
  }
}

/**
 * What a tab remembers of an address: the path and the query, never the
 * fragment. A fragment is where credentials travel precisely because it is
 * never sent to a server — an impersonation hand-off (`#_imp=<token>`), an
 * OAuth implicit grant. A tab that kept it would write the token into
 * localStorage and put it back in the address bar every time the tab was
 * clicked. An in-page anchor is the only thing lost, and a tab switch that
 * lands at the top of the section rather than on the anchor is a fair price.
 */
const pathOf = (location: TabLocation) => `${location.pathname}${location.search}`;

/** A path back into the parts `resolve` reads. Relative to nothing: every
 *  stored path starts with `/`. */
export function parseTabPath(path: string): TabLocation {
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const rest = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const searchAt = rest.indexOf('?');
  return {
    pathname: searchAt >= 0 ? rest.slice(0, searchAt) : rest,
    search: searchAt >= 0 ? rest.slice(searchAt) : '',
    hash,
  };
}

function readStorage(key: string | undefined): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function PageTabsProvider({
  children,
  resolve,
  pinned = [],
  storageKey,
  maxTabs = DEFAULT_MAX_TABS,
  enabled = true,
  confirmDiscard,
}: PageTabsProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const strings = useShellStrings().pageTabs;
  const idPrefix = useId();

  // `resolve` is usually an inline function; hold the latest in a ref so the
  // callbacks below stay stable without asking the consumer to memoise it.
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  const entryFor = useCallback((loc: TabLocation): TabEntry | null => {
    const route = resolveRef.current(loc);
    if (!route) return null;
    return { key: route.key ?? loc.pathname, path: pathOf(loc), title: route.title };
  }, []);

  const [state, dispatch] = useReducer(reducer, undefined, (): TabsState => {
    const restored = restore(readStorage(storageKey), (path) => entryFor(parseTabPath(path)));
    const pinnedEntries = pinned
      .map((path) => entryFor(parseTabPath(path)))
      .filter((e): e is TabEntry => Boolean(e));
    let initial = ensurePinned({ ...emptyState(), tabs: restored }, pinnedEntries);
    // The first address is visited here, not in an effect, so the first paint
    // already has its tab — no frame of "no tab" before the page appears.
    const entry = enabled ? entryFor(location) : null;
    initial = entry ? visit(initial, entry, maxTabs) : visitTransient(initial);
    return initial;
  });

  // The async handlers (close waits on a dialog) read the state as it is when
  // they resume, not as it was when they started.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Each tab's last location, so a hidden tab keeps rendering the address it
  // was at (with its router state) rather than the current one.
  const locations = useRef(new Map<string, Location>());
  const current = enabled ? entryFor(location) : null;
  const currentKey = current?.key ?? null;

  useLayoutEffect(() => {
    if (!enabled) return;
    const entry = entryFor(location);
    if (entry) {
      locations.current.set(entry.key, location);
      dispatch({ type: 'visit', entry, maxTabs });
    } else {
      dispatch({ type: 'transient' });
    }
  }, [location, enabled, maxTabs, entryFor]);

  // Forget the locations of tabs that are gone.
  useEffect(() => {
    const open = new Set(state.tabs.map((t) => t.key));
    for (const key of locations.current.keys()) if (!open.has(key)) locations.current.delete(key);
  }, [state.tabs]);

  const serialized = useMemo(() => serialize(state), [state]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, serialized);
    } catch {
      /* storage full or unavailable — the strip just won't survive a reload */
    }
  }, [serialized, storageKey]);

  // Unsaved work anywhere holds the browser tab, as a dirty window did.
  const anyDirty = state.dirty.length > 0;
  useEffect(() => {
    if (!anyDirty) return;
    const hold = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome still needs returnValue set to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', hold);
    return () => window.removeEventListener('beforeunload', hold);
  }, [anyDirty]);

  const ids = useRef(new Map<string, number>());
  const idFor = useCallback(
    (key: string, part: 'tab' | 'panel') => {
      let n = ids.current.get(key);
      if (n === undefined) {
        n = ids.current.size;
        ids.current.set(key, n);
      }
      return `${idPrefix}-page-${part}-${n}`;
    },
    [idPrefix],
  );

  const askDiscard = useCallback(
    (tabs: PageTab[]) => {
      if (confirmDiscard) return confirmDiscard(tabs);
      return confirm({
        title: strings.discardTitle,
        message: tabs.length === 1 ? strings.discardOne : `${tabs.length} ${strings.discardMany}`,
        confirmLabel: strings.discardConfirm,
        cancelLabel: strings.keepEditing,
        variant: 'warning',
      });
    },
    [confirmDiscard, strings],
  );

  const fallbackPath = useCallback(() => {
    const s = stateRef.current;
    return s.tabs.find((t) => t.pinned)?.path ?? '/';
  }, []);

  /**
   * Close `keys` now. If the tab on screen is among them it is not removed
   * here — it is marked closing and the address moves to `to` (or the
   * nearest surviving tab); `visit` drops it once the address has left.
   */
  const closeNow = useCallback(
    (keys: string[], to?: string, prefer?: string | null) => {
      const s = stateRef.current;
      const active = s.activeKey;
      if (!active || !keys.includes(active)) {
        dispatch({ type: 'close', keys, closing: null });
        return;
      }
      let target = to;
      if (!target) {
        const survivors = { ...s, tabs: s.tabs.filter((t) => t.key === active || !keys.includes(t.key)) };
        const preferred = prefer ? s.tabs.find((t) => t.key === prefer && !keys.includes(t.key)) : undefined;
        target = (preferred ?? neighbourOf(survivors, active))?.path ?? fallbackPath();
      }
      dispatch({ type: 'close', keys: keys.filter((k) => k !== active), closing: active });
      navigate(target);
    },
    [navigate, fallbackPath],
  );

  const close = useCallback(
    async (key: string, options: CloseTabOptions = {}) => {
      const tab = stateRef.current.tabs.find((t) => t.key === key);
      if (!tab || tab.pinned) {
        if (options.to) navigate(options.to);
        return false;
      }
      if (!options.force && stateRef.current.dirty.includes(key) && !(await askDiscard([tab]))) return false;
      // The dialog took time: the tab may have closed some other way.
      if (!stateRef.current.tabs.some((t) => t.key === key)) return false;
      closeNow([key], options.to);
      return true;
    },
    [askDiscard, closeNow, navigate],
  );

  const closeMany = useCallback(
    async (scope: 'others' | 'right' | 'all', key: string | null) => {
      let keys = keysToClose(stateRef.current, scope, key);
      const dirty = stateRef.current.tabs.filter(
        (t) => keys.includes(t.key) && stateRef.current.dirty.includes(t.key),
      );
      // One question for the lot. Declining keeps the unsaved ones and still
      // closes the rest — the user asked for fewer tabs, not for nothing.
      if (dirty.length && !(await askDiscard(dirty))) {
        keys = keys.filter((k) => !dirty.some((t) => t.key === k));
      }
      const open = new Set(stateRef.current.tabs.map((t) => t.key));
      keys = keys.filter((k) => open.has(k));
      if (keys.length) closeNow(keys, undefined, scope === 'all' ? null : key);
    },
    [askDiscard, closeNow],
  );

  const activate = useCallback(
    (key: string) => {
      const tab = stateRef.current.tabs.find((t) => t.key === key);
      if (!tab || key === stateRef.current.activeKey) return;
      navigate(tab.path);
    },
    [navigate],
  );

  const setTitle = useCallback((key: string, title: string) => dispatch({ type: 'title', key, title }), []);
  const setDirty = useCallback((key: string, dirty: boolean) => dispatch({ type: 'dirty', key, dirty }), []);
  const keyFor = useCallback((loc: TabLocation) => entryFor(loc)?.key ?? null, [entryFor]);
  const locationFor = useCallback((key: string) => locations.current.get(key), []);

  const visibleTabs = useMemo(
    () => (enabled ? state.tabs.filter((t) => t.key !== state.closing) : []),
    [enabled, state.tabs, state.closing],
  );

  const value = useMemo<PageTabsContextValue>(
    () => ({
      enabled,
      state,
      currentKey,
      resolve,
      keyFor,
      locationFor,
      idFor,
      activate,
      close,
      closeMany,
      setTitle,
      setDirty,
      visibleTabs,
    }),
    [enabled, state, currentKey, resolve, keyFor, locationFor, idFor, activate, close, closeMany, setTitle, setDirty, visibleTabs],
  );

  return <PageTabsContext.Provider value={value}>{children}</PageTabsContext.Provider>;
}
