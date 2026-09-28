/**
 * PageTabBar — the strip of open pages.
 *
 * One tab per open page, newest on the right, pinned ones first. Click a tab to
 * go back to it; its × (or a middle-click, or Delete while it has focus) closes
 * it; right-click offers Close, Close other tabs, Close tabs to the right and
 * Close all. A tab with unsaved changes shows a dot where its × would be and
 * asks before it goes.
 *
 * Keyboard: the strip is one tab stop and the arrow keys move along it (Home /
 * End to the ends) — the roving-tabindex tablist pattern the kit's `Tabs` uses.
 * Moving focus does not switch pages; Enter or Space does, because switching
 * navigates and a user arrowing past five tabs should not visit five pages.
 *
 * The strip can be an app's whole top bar: `end` puts controls at its right
 * (a connection light, a theme switch) that stay put while the tabs scroll.
 * The active tab takes the page's background and covers the strip's bottom
 * rule, so it reads as the top of the page below it — give `activeClassName`
 * the page's background if it is not `bg-gray-50`.
 *
 * Renders nothing when tabs are off (`enabled={false}` on the provider).
 */
import { useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { PopupMenu, PopupMenuDivider, PopupMenuItem } from '../shell/PopupMenu';
import { useShellStrings } from '../shell/strings';
import { PageTabsContext } from './context';
import { parseTabPath } from './PageTabsProvider';
import type { PageTab } from './tabsModel';

export interface PageTabBarProps {
  /** Replaces the strip's own classes (height, background, padding). */
  className?: string;
  /** Replaces the active tab's colours — its background should be the
   *  page's, so the tab and the page read as one surface. */
  activeClassName?: string;
  /** Controls at the right end of the strip. They do not scroll with the
   *  tabs. */
  end?: ReactNode;
}

const STRIP = 'relative flex h-10 shrink-0 items-end gap-3 bg-gray-100 px-3';

/** The tabs scroll sideways inside this; the scrollbar is hidden (a wheel or
 *  a trackpad still scrolls it, and the active tab is kept in view). */
const TABLIST =
  'flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const TAB_BASE =
  'group relative flex h-9 min-w-0 max-w-[15rem] shrink-0 items-center rounded-t-md border border-b-0 text-[13px] transition-colors';
const TAB_ACTIVE = 'z-[1] border-gray-200 bg-gray-50 text-gray-900';
const TAB_IDLE = 'border-transparent text-gray-600 hover:bg-gray-200/70 hover:text-gray-900';

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3.5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

interface MenuState {
  x: number;
  y: number;
  key: string;
}

export default function PageTabBar({ className, activeClassName, end }: PageTabBarProps) {
  const ctx = useContext(PageTabsContext);
  const strings = useShellStrings().pageTabs;
  const stripRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const activeKey = ctx?.currentKey ?? null;

  // Keep the tab on screen in view — a page opened from the menu lands at the
  // far right of a strip that may be scrolled the other way.
  useEffect(() => {
    if (!ctx || !activeKey) return;
    const el = document.getElementById(ctx.idFor(activeKey, 'tab'));
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [ctx, activeKey]);

  if (!ctx || !ctx.enabled) return null;
  const { visibleTabs: tabs, state, idFor, activate, close, closeMany, resolve } = ctx;
  const focusKey = tabs.some((t) => t.key === activeKey) ? activeKey : tabs[0]?.key;

  const focusTab = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (tab) document.getElementById(idFor(tab.key, 'tab'))?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => document.getElementById(idFor(t.key, 'tab')) === e.target);
    if (i < 0) return;
    if (e.key === 'ArrowRight') focusTab(i + 1);
    else if (e.key === 'ArrowLeft') focusTab(i - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(tabs.length - 1);
    else if (e.key === 'Delete' && !tabs[i].pinned) void close(tabs[i].key);
    else return;
    e.preventDefault();
  };

  const onContextMenu = (e: MouseEvent, tab: PageTab) => {
    // Claimed, so the shell's global menu stands down (see ShellContextMenu).
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, key: tab.key });
  };

  const onAuxClick = (e: MouseEvent, tab: PageTab) => {
    if (e.button !== 1 || tab.pinned) return;
    e.preventDefault();
    void close(tab.key);
  };

  const menuTab = menu ? tabs.find((t) => t.key === menu.key) : undefined;
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1;
  const closable = (list: PageTab[]) => list.some((t) => !t.pinned);
  const run = (fn: () => unknown) => () => {
    setMenu(null);
    void fn();
  };

  return (
    <div className={className ?? STRIP}>
      {/* The strip's bottom rule, drawn as its own layer so the active tab —
          stacked above it — can cover it. A border on the scrolling list
          could not be covered: the list clips anything that reaches past it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gray-200" />
      <div
        ref={stripRef}
        role="tablist"
        aria-label={strings.label}
        onKeyDown={onKeyDown}
        className={TABLIST}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const dirty = state.dirty.includes(tab.key);
          const icon = resolve(parseTabPath(tab.path))?.icon;
          return (
            <div
              key={tab.key}
              role="presentation"
              className={`${TAB_BASE} ${active ? (activeClassName ?? TAB_ACTIVE) : TAB_IDLE}`}
              onContextMenu={(e) => onContextMenu(e, tab)}
              onAuxClick={(e) => onAuxClick(e, tab)}
              // A middle-press would otherwise start the browser's autoscroll.
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
            >
              <button
                type="button"
                role="tab"
                id={idFor(tab.key, 'tab')}
                aria-selected={active}
                aria-controls={state.mounted.includes(tab.key) ? idFor(tab.key, 'panel') : undefined}
                tabIndex={tab.key === focusKey ? 0 : -1}
                title={tab.title}
                onClick={() => activate(tab.key)}
                className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-t-md pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  tab.pinned ? 'pr-3' : 'pr-1'
                }`}
              >
                {icon && (
                  // The consumer's nav icons, whatever size they were drawn
                  // at for the sidebar, sit at the strip's size here.
                  <span
                    className="flex size-4 shrink-0 items-center justify-center text-gray-500 [&>svg]:size-4"
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                )}
                <span className="truncate">{tab.title}</span>
              </button>
              {!tab.pinned && (
                <span className="mr-1.5 flex size-5 shrink-0 items-center justify-center">
                  {dirty && (
                    <span
                      role="img"
                      aria-label={strings.unsaved}
                      className="size-2 rounded-full bg-gray-500 group-hover:hidden"
                    />
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${strings.close} ${tab.title}`}
                    onClick={() => void close(tab.key)}
                    className={`size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 ${
                      dirty ? 'hidden group-hover:flex' : active ? 'flex' : 'flex opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <CloseIcon />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {end && <div className="flex shrink-0 items-center gap-2 self-center">{end}</div>}

      {menu && menuTab && (
        <PopupMenu portal style={{ left: menu.x, top: menu.y }} onClose={() => setMenu(null)}>
          <PopupMenuItem disabled={menuTab.pinned} onClick={run(() => close(menuTab.key))}>
            {strings.close}
          </PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem
            disabled={!closable(tabs.filter((t) => t.key !== menuTab.key))}
            onClick={run(() => closeMany('others', menuTab.key))}
          >
            {strings.closeOthers}
          </PopupMenuItem>
          <PopupMenuItem
            disabled={!closable(tabs.slice(menuIndex + 1))}
            onClick={run(() => closeMany('right', menuTab.key))}
          >
            {strings.closeRight}
          </PopupMenuItem>
          <PopupMenuItem disabled={!closable(tabs)} onClick={run(() => closeMany('all', null))}>
            {strings.closeAll}
          </PopupMenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
