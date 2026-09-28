/**
 * PageTabsOutlet — renders every open tab's page, and shows one.
 *
 * Each open tab gets a frame that renders the consumer's routes at THAT TAB'S
 * address (`children(location)`, typically `<Routes location={location}>`), so
 * a hidden tab keeps its page mounted — its query results, its filters, the
 * form half filled in — while a different page is on screen. The router's own
 * `<Routes location>` is what makes this possible: inside it, `useLocation`,
 * `useParams` and relative links all answer for the tab's address, not the
 * browser's.
 *
 * ## Hidden is not the same as paused
 *
 * On React 19.2+ each frame is wrapped in `<Activity>`. A hidden Activity keeps
 * its state but runs its effects' clean-ups, and runs them again when shown.
 * That is the behaviour a hidden page needs: a list stops polling, a form's
 * ⌘S handler stops listening (a keystroke in one tab must not submit another
 * tab's form), `document.title` is set again by whichever page comes forward.
 * React 18 has no Activity; there the frame is only hidden and its effects keep
 * running (`PAGE_TABS_PAUSE_HIDDEN` says which you got). The peer range is
 * still `react >=18`, so both are supported — but a portal whose pages bind
 * global listeners wants 19.2.
 *
 * ## Scroll
 *
 * A frame is the page's scroll container (give it `overflow-y-auto` through
 * `frameClassName`), and scrolling inside a hidden element is not something
 * browsers keep. The frame records scroll positions — its own and any
 * scrolling list inside it — while it is on screen, and puts them back when it
 * is shown again.
 */
import * as ReactModule from 'react';
import {
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useLocation, type Location } from 'react-router-dom';

import { PageTabFrameContext, PageTabsContext, type PageTabFrame } from './context';

/** React 19.2's keep-alive primitive, or undefined on older Reacts. Read off
 *  the namespace so this module still loads (and type-checks) on React 18. */
const Activity = (ReactModule as unknown as {
  Activity?: ComponentType<{ mode: 'visible' | 'hidden'; children?: ReactNode }>;
}).Activity;

/** True when hidden tabs are paused (`<Activity>`), false when they are only
 *  hidden. Exported for the consumer that wants to know which it got. */
export const PAGE_TABS_PAUSE_HIDDEN = Boolean(Activity);

function KeepAlive({ active, children }: { active: boolean; children: ReactNode }) {
  if (Activity) return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>;
  return <>{children}</>;
}

interface FrameProps {
  tabKey: string;
  active: boolean;
  location: Location;
  render: (location: Location) => ReactNode;
  className?: string;
  panelId?: string;
  tabId?: string;
}

/**
 * A hidden frame re-renders only when its own address changes. Every
 * navigation re-renders the outlet, and without this each one would re-render
 * every open page behind the one in view — the outlet's `children` is a fresh
 * function each time, but it renders the same routes. Contexts the pages read
 * still reach them; this only stops the outlet's own re-render cascading.
 */
const sameFrame = (a: FrameProps, b: FrameProps) =>
  a.active === b.active &&
  a.location === b.location &&
  a.className === b.className &&
  a.panelId === b.panelId &&
  a.tabId === b.tabId &&
  (!b.active || a.render === b.render);

const TabFrame = memo(function TabFrame({ tabKey, active, location, render, className, panelId, tabId }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const scrolls = useRef(new Map<Element, [number, number]>());

  // A layout effect, so `activeRef` is already false by the time a hiding
  // Activity runs its subtree's passive clean-ups (see PageTabFrame).
  useLayoutEffect(() => {
    const wasActive = activeRef.current;
    activeRef.current = active;
    if (!active || wasActive) return;
    for (const [el, [top, left]] of scrolls.current) {
      if (!el.isConnected) {
        scrolls.current.delete(el);
        continue;
      }
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `scroll` does not bubble, but it can be captured: one listener here
    // hears the frame and every scrolling element inside it.
    const onScroll = (e: Event) => {
      if (!activeRef.current) return;
      const target = e.target as Element | null;
      if (!target || typeof target.scrollTop !== 'number') return;
      scrolls.current.set(target, [target.scrollTop, target.scrollLeft]);
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  }, []);

  const frame = useMemo<PageTabFrame>(() => ({ key: tabKey, activeRef }), [tabKey]);

  return (
    <div
      ref={ref}
      role={panelId ? 'tabpanel' : undefined}
      id={panelId}
      aria-labelledby={tabId}
      hidden={!active}
      // Inline, not the `hidden` attribute alone: a `flex` or `block` class on
      // the frame would out-rank the user-agent rule and show it anyway.
      style={active ? undefined : { display: 'none' }}
      className={className}
      data-page-tab={tabKey}
    >
      <PageTabFrameContext.Provider value={frame}>
        <KeepAlive active={active}>{render(location)}</KeepAlive>
      </PageTabFrameContext.Provider>
    </div>
  );
}, sameFrame);

export interface PageTabsOutletProps {
  /** Render the page at an address — usually `<Routes location={location}>`
   *  with the app's content routes. Called once per open tab. */
  children: (location: Location) => ReactNode;
  /** Classes for each tab's frame. The frame is the page's scroll container,
   *  so it wants a height and `overflow-y-auto`. */
  frameClassName?: string;
}

const TRANSIENT = '\u0000transient';

export default function PageTabsOutlet({ children, frameClassName }: PageTabsOutletProps) {
  const ctx = useContext(PageTabsContext);
  const location = useLocation();

  if (!ctx || !ctx.enabled) {
    return (
      <div className={frameClassName} key={TRANSIENT}>
        {children(location)}
      </div>
    );
  }

  const { state, currentKey, locationFor, idFor } = ctx;
  // Every tab rendered so far, in strip order, plus the one the address is on
  // if the state has not caught up with it yet. Keyed by tab, so a frame keeps
  // its place in the tree — and its page — however the strip is reordered.
  const keys = state.tabs.filter((t) => state.mounted.includes(t.key)).map((t) => t.key);
  if (currentKey && !keys.includes(currentKey)) keys.push(currentKey);

  return (
    <>
      {keys.map((key) => {
        const active = key === currentKey;
        const loc = active ? location : locationFor(key);
        // A tab never shown this session has no location to render at; it
        // waits until it is opened.
        if (!loc) return null;
        return (
          <TabFrame
            key={key}
            tabKey={key}
            active={active}
            location={loc}
            render={children}
            className={frameClassName}
            panelId={idFor(key, 'panel')}
            tabId={idFor(key, 'tab')}
          />
        );
      })}
      {!currentKey && (
        <TabFrame key={TRANSIENT} tabKey={TRANSIENT} active location={location} render={children} className={frameClassName} />
      )}
    </>
  );
}
