/**
 * What a page asks of the tab it is in — and what the rest of the app asks of
 * the strip.
 *
 * Every hook here is safe outside a tab: with no provider, or with tabs turned
 * off (a phone), they do nothing, and `usePageTab().close` still honours `to`.
 * A page written for tabs therefore works unchanged without them.
 */
import { useCallback, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageTabFrameContext, PageTabsContext, type CloseTabOptions } from './context';
import type { PageTab } from './tabsModel';

export interface PageTabsApi {
  enabled: boolean;
  tabs: PageTab[];
  activeKey: string | null;
  activate: (key: string) => void;
  close: (key: string, options?: CloseTabOptions) => Promise<boolean>;
  closeOthers: (key: string) => Promise<void>;
  closeRight: (key: string) => Promise<void>;
  closeAll: () => Promise<void>;
}

const NO_TABS: PageTabsApi = {
  enabled: false,
  tabs: [],
  activeKey: null,
  activate: () => {},
  close: async () => false,
  closeOthers: async () => {},
  closeRight: async () => {},
  closeAll: async () => {},
};

/** The strip, for code outside any one page (a keyboard shortcut, a menu). */
export function usePageTabs(): PageTabsApi {
  const ctx = useContext(PageTabsContext);
  if (!ctx || !ctx.enabled) return NO_TABS;
  return {
    enabled: true,
    tabs: ctx.visibleTabs,
    activeKey: ctx.currentKey,
    activate: ctx.activate,
    close: ctx.close,
    closeOthers: (key) => ctx.closeMany('others', key),
    closeRight: (key) => ctx.closeMany('right', key),
    closeAll: () => ctx.closeMany('all', null),
  };
}

export interface PageTabHandle {
  /** This page's tab, or null outside one. */
  key: string | null;
  /**
   * Close this page's tab. Unsaved changes are asked about unless `force`.
   * Outside a tab it only navigates to `to`, if given. Resolves true when the
   * tab closed.
   */
  close: (options?: CloseTabOptions) => Promise<boolean>;
}

/** The tab this page is in. */
export function usePageTab(): PageTabHandle {
  const ctx = useContext(PageTabsContext);
  const frame = useContext(PageTabFrameContext);
  const navigate = useNavigate();
  const key = ctx?.enabled && frame ? frame.key : null;
  const close = useCallback(
    async (options: CloseTabOptions = {}) => {
      if (ctx?.enabled && frame && ctx.state.tabs.some((t) => t.key === frame.key)) {
        return ctx.close(frame.key, options);
      }
      if (options.to) navigate(options.to);
      return false;
    },
    [ctx, frame, navigate],
  );
  return { key, close };
}

/**
 * Name this page's tab — a record's number once it has loaded, say. Empty
 * strings are ignored, so a page can pass its title before the data arrives.
 * The name sticks: moving within the tab (a filter, a hash) keeps it.
 */
export function usePageTabTitle(title: string | null | undefined): void {
  const ctx = useContext(PageTabsContext);
  const frame = useContext(PageTabFrameContext);
  const setTitle = ctx?.enabled ? ctx.setTitle : undefined;
  const key = frame?.key;
  useEffect(() => {
    if (setTitle && key && title) setTitle(key, title);
  }, [setTitle, key, title]);
}

/**
 * Mark this page's tab as holding unsaved changes. Closing it then asks
 * first, and the browser tab asks before a reload.
 *
 * The flag survives the tab being hidden. A hidden tab's effects are cleaned
 * up (see PageTabsOutlet), and clearing the flag in that clean-up would let a
 * hidden form close silently; so the clean-up only clears it when the page
 * went away while its tab was on screen (the tab moved to another page). A
 * closed tab's flag goes with the tab.
 */
export function usePageTabDirty(dirty: boolean): void {
  const ctx = useContext(PageTabsContext);
  const frame = useContext(PageTabFrameContext);
  const setDirty = ctx?.enabled ? ctx.setDirty : undefined;
  useEffect(() => {
    if (!setDirty || !frame) return;
    setDirty(frame.key, dirty);
    return () => {
      if (frame.activeRef.current) setDirty(frame.key, false);
    };
  }, [setDirty, frame, dirty]);
}
