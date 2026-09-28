/**
 * The two contexts page tabs run on, in their own module so the provider, the
 * outlet, the strip and the page hooks can all import them without importing
 * each other.
 */
import { createContext, type ReactNode } from 'react';
import type { Location } from 'react-router-dom';

import type { PageTab, TabsState } from './tabsModel';

/** What the consumer's route table says about an address. */
export interface PageTabRoute {
  /** The tab's name until the page names it (`usePageTabTitle`). */
  title: string;
  /** Identity; defaults to the pathname. Give two addresses the same key to
   *  make them one tab. */
  key?: string;
  /** Drawn before the title in the strip. Never persisted — re-resolved from
   *  the address, so a restored tab gets today's icon. */
  icon?: ReactNode;
}

/** The parts of a location a route decision may depend on. */
export type TabLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

/** Return null for an address that is never a tab: a redirect on its way
 *  somewhere, a page that must not stay open behind others. */
export type ResolvePageTab = (location: TabLocation) => PageTabRoute | null;

export interface CloseTabOptions {
  /** Go here instead of the neighbouring tab (a form that just created its
   *  record goes to the record). */
  to?: string;
  /** Skip the unsaved-changes question — the page knows its work is saved. */
  force?: boolean;
}

export interface PageTabsContextValue {
  enabled: boolean;
  state: TabsState;
  /** The tab the address is on right now, derived during render — a frame
   *  must not wait an effect to learn it is the visible one. */
  currentKey: string | null;
  resolve: ResolvePageTab;
  keyFor: (location: TabLocation) => string | null;
  locationFor: (key: string) => Location | undefined;
  idFor: (key: string, part: 'tab' | 'panel') => string;
  activate: (key: string) => void;
  close: (key: string, options?: CloseTabOptions) => Promise<boolean>;
  closeMany: (scope: 'others' | 'right' | 'all', key: string | null) => Promise<void>;
  setTitle: (key: string, title: string) => void;
  setDirty: (key: string, dirty: boolean) => void;
  visibleTabs: PageTab[];
}

export const PageTabsContext = createContext<PageTabsContextValue | null>(null);

/** Which tab a subtree belongs to. `activeRef` is written in a layout effect,
 *  which runs before a hidden subtree's passive effect clean-ups — so a
 *  clean-up can tell "my tab was hidden" (keep my state) from "my page was
 *  replaced while on screen" (drop it). */
export interface PageTabFrame {
  key: string;
  activeRef: { current: boolean };
}

export const PageTabFrameContext = createContext<PageTabFrame | null>(null);
