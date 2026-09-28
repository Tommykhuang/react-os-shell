/**
 * Page tabs, mounted for real: a MemoryRouter, the provider, the strip and the
 * outlet rendering `<Routes location>` per tab.
 *
 * The promise under test is the one users feel: a page left for another tab is
 * still there, in the state it was left in, when its tab is clicked again. And
 * the edges of it — a tab with unsaved work asks before it goes, a redirect is
 * not a tab, a reload brings the strip back without rendering every page in
 * it, and (on React 19.2, where hidden tabs are paused) a hidden page's
 * listeners are really gone.
 *
 * Sync `act` around clicks, `flush` after anything that awaits — see dom.ts.
 */
import { act, flush, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect, useState } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import {
  PAGE_TABS_PAUSE_HIDDEN,
  PageTabBar,
  PageTabsOutlet,
  PageTabsProvider,
  usePageTab,
  usePageTabDirty,
  usePageTabTitle,
  type PageTab,
  type ResolvePageTab,
} from '../src/page-tabs';

const resolve: ResolvePageTab = (loc) =>
  loc.pathname === '/redirect' ? null : { title: `Page ${loc.pathname.slice(1)}` };

function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-counter={name} onClick={() => setN(n + 1)}>
      {name}:{n}
    </button>
  );
}

function DirtyForm() {
  usePageTabDirty(true);
  return <p>form</p>;
}

function Titled() {
  usePageTabTitle('SO-0041');
  return <p>record</p>;
}

let listeners = 0;
function Listening() {
  useEffect(() => {
    listeners += 1;
    return () => {
      listeners -= 1;
    };
  }, []);
  return <p>listening</p>;
}

function SavesAndLeaves() {
  const tab = usePageTab();
  return (
    <button type="button" data-save onClick={() => void tab.close({ to: '/a', force: true })}>
      save
    </button>
  );
}

let go: (to: string) => void = () => {};
function Nav() {
  const navigate = useNavigate();
  go = (to) => navigate(to);
  return null;
}

interface Options {
  initial?: string;
  resolve?: ResolvePageTab;
  storageKey?: string;
  pinned?: string[];
  maxTabs?: number;
  confirmDiscard?: (tabs: PageTab[]) => Promise<boolean>;
}

function mount({ initial = '/a', storageKey, pinned, maxTabs, confirmDiscard, resolve: resolveWith = resolve }: Options = {}) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <PageTabsProvider
        resolve={resolveWith}
        storageKey={storageKey}
        pinned={pinned}
        maxTabs={maxTabs}
        confirmDiscard={confirmDiscard ?? (async () => true)}
      >
        <Nav />
        <PageTabBar />
        <PageTabsOutlet>
          {(location) => (
            <Routes location={location}>
              <Route path="/a" element={<Counter name="a" />} />
              <Route path="/b" element={<Counter name="b" />} />
              <Route path="/c" element={<Counter name="c" />} />
              <Route path="/form" element={<DirtyForm />} />
              <Route path="/record" element={<Titled />} />
              <Route path="/listen" element={<Listening />} />
              <Route path="/save" element={<SavesAndLeaves />} />
              <Route path="/redirect" element={<Navigate to="/b" replace />} />
            </Routes>
          )}
        </PageTabsOutlet>
      </PageTabsProvider>
    </MemoryRouter>,
  );
}

const tabTitles = (c: HTMLElement) => [...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
const tabButton = (c: HTMLElement, title: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === title)!;
const counter = (c: HTMLElement, name: string) => c.querySelector<HTMLButtonElement>(`[data-counter="${name}"]`);
const visible = (el: Element | null) => Boolean(el && !el.closest('[data-page-tab][hidden]'));
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const navigateTo = (to: string) => act(() => { go(to); });

test('a page left for another tab keeps its state, and comes back as it was', () => {
  const view = mount();
  click(counter(view.container, 'a'));
  click(counter(view.container, 'a'));
  navigateTo('/b');

  assert.deepEqual(tabTitles(view.container), ['Page a', 'Page b']);
  assert.equal(visible(counter(view.container, 'a')), false, 'a is hidden, not gone');
  assert.equal(counter(view.container, 'a')?.textContent, 'a:2');

  click(tabButton(view.container, 'Page a'));
  assert.equal(visible(counter(view.container, 'a')), true);
  assert.equal(counter(view.container, 'a')?.textContent, 'a:2', 'the same instance, not a remount');
  assert.equal(tabButton(view.container, 'Page a').getAttribute('aria-selected'), 'true');
  view.unmount();
});

test('the tab and its panel name each other', () => {
  const view = mount();
  const tab = tabButton(view.container, 'Page a');
  const panel = document.getElementById(tab.getAttribute('aria-controls')!);
  assert.equal(panel?.getAttribute('role'), 'tabpanel');
  assert.equal(panel?.getAttribute('aria-labelledby'), tab.id);
  view.unmount();
});

test('closing the tab on screen goes to its right-hand neighbour, else its left', async () => {
  const view = mount();
  navigateTo('/b');
  navigateTo('/c');
  click(tabButton(view.container, 'Page b'));

  click(view.container.querySelector('[aria-label="Close Page b"]'));
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page a', 'Page c']);
  assert.equal(visible(counter(view.container, 'c')), true, 'went right');
  assert.equal(counter(view.container, 'b'), null, 'the closed page is unmounted');

  click(view.container.querySelector('[aria-label="Close Page c"]'));
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page a']);
  assert.equal(visible(counter(view.container, 'a')), true, 'nothing to the right: went left');
  view.unmount();
});

test('unsaved work asks first; declining keeps the tab', async () => {
  const asked: string[][] = [];
  let answer = false;
  const view = mount({
    confirmDiscard: async (tabs) => {
      asked.push(tabs.map((t) => t.key));
      return answer;
    },
  });
  navigateTo('/form');
  assert.ok(view.container.querySelector('[aria-label="Unsaved changes"]'), 'the strip marks it');

  click(view.container.querySelector('[aria-label="Close Page form"]'));
  await flush();
  assert.deepEqual(asked, [['/form']]);
  assert.deepEqual(tabTitles(view.container), ['Page a', 'Page form'], 'declined: still open');

  answer = true;
  click(view.container.querySelector('[aria-label="Close Page form"]'));
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page a']);
  view.unmount();
});

test('the unsaved mark survives the tab being hidden', async () => {
  const asked: string[] = [];
  const view = mount({
    confirmDiscard: async (tabs) => {
      asked.push(...tabs.map((t) => t.key));
      return true;
    },
  });
  navigateTo('/form');
  navigateTo('/a');
  click(view.container.querySelector('[aria-label="Close Page form"]'));
  await flush();
  assert.deepEqual(asked, ['/form'], 'a hidden form still asks');
  view.unmount();
});

test('a page that has saved closes its own tab and goes where it says', async () => {
  const view = mount();
  navigateTo('/save');
  click(view.container.querySelector('[data-save]'));
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page a']);
  assert.equal(visible(counter(view.container, 'a')), true);
  view.unmount();
});

test('an address the route table excludes opens no tab', () => {
  const view = mount();
  navigateTo('/redirect');
  assert.deepEqual(tabTitles(view.container), ['Page a', 'Page b'], 'the redirect left no tab behind');
  assert.equal(visible(counter(view.container, 'b')), true);
  view.unmount();
});

test('a page names its own tab', () => {
  const view = mount();
  navigateTo('/record');
  assert.deepEqual(tabTitles(view.container), ['Page a', 'SO-0041']);
  view.unmount();
});

test('middle-click closes a tab', async () => {
  const view = mount();
  navigateTo('/b');
  const tab = tabButton(view.container, 'Page a').parentElement!;
  act(() => {
    tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
  });
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page b']);
  view.unmount();
});

test('right-click offers the bulk closes; "Close other tabs" keeps the one clicked', async () => {
  const view = mount({ pinned: ['/c'] });
  navigateTo('/b');
  const tabA = tabButton(view.container, 'Page a').parentElement!;
  act(() => {
    tabA.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  });
  const item = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Close other tabs');
  assert.ok(item, 'the menu is open');
  click(item!);
  await flush();
  assert.deepEqual(tabTitles(view.container), ['Page c', 'Page a'], 'the pinned tab stays, first');
  assert.equal(visible(counter(view.container, 'a')), true, 'the kept tab is now on screen');
  view.unmount();
});

test('a pinned tab has no close button and leads the strip', () => {
  const view = mount({ pinned: ['/c'] });
  assert.deepEqual(tabTitles(view.container), ['Page c', 'Page a']);
  assert.equal(view.container.querySelector('[aria-label="Close Page c"]'), null);
  view.unmount();
});

test('a reload brings the strip back, rendering only the page on screen', () => {
  const key = 'tabs:test-restore';
  localStorage.setItem(
    key,
    JSON.stringify({ v: 1, tabs: [{ key: '/b', path: '/b', title: 'Kept', titleFrom: 'page' }] }),
  );
  const view = mount({ storageKey: key });
  assert.deepEqual(tabTitles(view.container), ['Kept', 'Page a']);
  assert.equal(counter(view.container, 'b'), null, 'not rendered until opened');

  click(tabButton(view.container, 'Kept'));
  assert.equal(visible(counter(view.container, 'b')), true);
  const saved = JSON.parse(localStorage.getItem(key)!);
  assert.deepEqual(saved.tabs.map((t: { key: string }) => t.key), ['/b', '/a']);
  view.unmount();
  localStorage.removeItem(key);
});

test('a fragment is never remembered: a token handed over in one stays out of storage and the tab', () => {
  const key = 'tabs:test-fragment';
  const view = mount({ initial: '/a#_imp=secret-token', storageKey: key });
  navigateTo('/b');
  assert.ok(!localStorage.getItem(key)!.includes('secret-token'), 'not written to storage');

  click(tabButton(view.container, 'Page a'));
  const saved = JSON.parse(localStorage.getItem(key)!);
  assert.deepEqual(saved.tabs.map((t: { path: string }) => t.path), ['/a', '/b']);
  view.unmount();
  localStorage.removeItem(key);
});

test('past the limit the least recently used tab closes', () => {
  const view = mount({ maxTabs: 2 });
  navigateTo('/b');
  navigateTo('/c');
  assert.deepEqual(tabTitles(view.container), ['Page b', 'Page c']);
  view.unmount();
});

test('a hidden page is paused: its effects are cleaned up, and run again when shown', { skip: !PAGE_TABS_PAUSE_HIDDEN }, () => {
  listeners = 0;
  const view = mount({ initial: '/listen' });
  assert.equal(listeners, 1);
  navigateTo('/a');
  assert.equal(listeners, 0, 'hidden: listener gone');
  click(tabButton(view.container, 'Page listen'));
  assert.equal(listeners, 1, 'shown: listener back');
  view.unmount();
});

// ── Sizing: shrink like a browser's strip, never lose the way to close ─────

const withIcons: ResolvePageTab = (loc) =>
  loc.pathname === '/redirect'
    ? null
    : { title: `Page ${loc.pathname.slice(1)}`, icon: <svg data-icon={loc.pathname} /> };

const wrapperOf = (c: HTMLElement, title: string) => tabButton(c, title).parentElement!;

test('a pinned tab with an icon is the icon alone, and still named for assistive tech', () => {
  const view = mount({ pinned: ['/c'], resolve: withIcons });
  const pinned = tabButton(view.container, 'Page c');
  assert.ok(pinned.querySelector('[data-icon="/c"]'), 'draws its icon');
  const name = [...pinned.querySelectorAll('span')].find((s) => s.textContent === 'Page c');
  assert.equal(name?.className, 'sr-only', 'the title is kept, visually hidden');
  assert.equal(view.container.querySelector('[aria-label="Close Page c"]'), null);
  view.unmount();
});

test('tabs share the width and shrink evenly, each deciding its own detail by its width', () => {
  const view = mount({ resolve: withIcons });
  navigateTo('/b');
  for (const title of ['Page a', 'Page b']) {
    const cls = wrapperOf(view.container, title).className;
    assert.match(cls, /flex-\[0_1_15rem\]/, `${title} shrinks from 15rem rather than scrolling`);
    assert.match(cls, /@container/, `${title} is a size container`);
  }
  view.unmount();
});

test('the tab on screen keeps its × however narrow; a narrow idle tab shows its × on hover', () => {
  const view = mount({ resolve: withIcons });
  navigateTo('/b');
  const activeSlot = view.container.querySelector('[aria-label="Close Page b"]')!.parentElement!;
  const idleSlot = view.container.querySelector('[aria-label="Close Page a"]')!.parentElement!;
  assert.doesNotMatch(activeSlot.className, /@max-\[[^\]]+\]:hidden/);
  // Narrow, the idle tab's × steps aside — and comes back under the pointer
  // (Victor Mau: hovering a tab must always offer its ×).
  assert.match(idleSlot.className, /@max-\[6\.5rem\]:hidden/);
  assert.match(idleSlot.className, /@max-\[6\.5rem\]:group-hover:flex/);
  view.unmount();
});

test('a hairline separates idle tabs, and none sits beside the active one', () => {
  const view = mount({ resolve: withIcons });
  navigateTo('/b');
  navigateTo('/c');
  click(tabButton(view.container, 'Page a'));
  // a (active) | b | c  →  one hairline, between b and c.
  const list = view.container.querySelector('[role="tablist"]')!;
  const kinds = [...list.children].map((el) => (el.getAttribute('aria-hidden') === 'true' ? '|' : el.textContent));
  assert.deepEqual(kinds, ['Page a', 'Page b', '|', 'Page c']);
  view.unmount();
});
