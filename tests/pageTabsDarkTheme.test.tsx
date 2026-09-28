/**
 * The page-tab strip under the dark theme.
 *
 * Dark mode in this package is not a Tailwind variant: `ui.css` remaps class
 * names under `[data-theme="dark"]`, so a class with no remap keeps its light
 * value. Two marks on the strip had none, and both were measured on the dark
 * strip (`--surface`, #1e1e2e) in the dealer and customer portals on
 * 2026-09-28:
 *
 *   - the hairline between two idle tabs was `bg-gray-300`, and stayed light
 *     gray-300: a bright bar between every pair of idle tabs;
 *   - the unsaved dot on a narrow idle tab's icon is ringed in `ring-gray-100`
 *     to cut it out of the icon in the strip's colour, and the ring stayed
 *     light gray-100: a pale halo.
 *
 * Every class string was right, so no spec about markup noticed.
 *
 * Each mark gets two checks. The first reads the remap list: whatever colours
 * it is drawn with, ui.css has to remap them. The second cascades those remaps
 * in jsdom and reads the colour it actually gets, against the strip's. jsdom
 * drops any declaration it cannot parse, and every remap is written as
 * `var(--token)`, so the tokens are substituted from the dark block first.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import {
  PageTabBar,
  PageTabsOutlet,
  PageTabsProvider,
  usePageTabDirty,
  type ResolvePageTab,
} from '../src/page-tabs';
import { ROOT, darkRemaps } from './darkRemaps';

// The unsaved dot sits on the tab's icon, so every tab gets one.
const resolve: ResolvePageTab = (loc) => ({ title: `Page ${loc.pathname.slice(1)}`, icon: <svg /> });

let go: (to: string) => void = () => {};
function Nav() {
  const navigate = useNavigate();
  go = (to) => navigate(to);
  return null;
}

function Unsaved() {
  usePageTabDirty(true);
  return <p>form</p>;
}

function mount(initial: string) {
  const view = render(
    <MemoryRouter initialEntries={[initial]}>
      <PageTabsProvider resolve={resolve} confirmDiscard={async () => true}>
        <Nav />
        <PageTabBar />
        <PageTabsOutlet>
          {(location) => (
            <Routes location={location}>
              <Route path="/form" element={<Unsaved />} />
              <Route path="*" element={<p>page</p>} />
            </Routes>
          )}
        </PageTabsOutlet>
      </PageTabsProvider>
    </MemoryRouter>,
  );
  const list = view.container.querySelector('[role="tablist"]')!;
  return { view, list, strip: list.parentElement as HTMLElement };
}

/** a (active) | b | c: one hairline, between b and c. */
function mountIdlePair() {
  const { view, list, strip } = mount('/a');
  for (const to of ['/b', '/c', '/a']) act(() => { go(to); });
  const dividers = [...list.children].filter((el) => el.getAttribute('aria-hidden') === 'true') as HTMLElement[];
  assert.equal(dividers.length, 1, 'expected exactly one hairline, between the two idle tabs b and c');
  return { view, strip, divider: dividers[0] };
}

/** form (idle, unsaved) | a (active): the ringed dot on form's icon. */
function mountUnsavedIdle() {
  const { view, list, strip } = mount('/form');
  act(() => { go('/a'); });
  const dot = list.querySelector<HTMLElement>('[aria-hidden="true"] > .rounded-full');
  assert.ok(dot, "expected the unsaved dot on the idle tab's icon");
  return { view, strip, dot };
}

const COLOUR = /^(bg|border|ring)-([a-z]+-\d{2,3}|white|black)(\/\d+)?$/;

function assertRemapped(classes: string[], what: string) {
  // Without this, a mark that lost its colour class altogether would pass.
  assert.ok(classes.length > 0, `${what} carries no colour class`);
  const remaps = darkRemaps();
  const orphans = classes.filter((c) => !remaps.has(c));
  assert.deepEqual(
    orphans,
    [],
    `${what}: these stay light on the dark strip because ui.css does not remap them:\n  ` + orphans.join('\n  '),
  );
}

test('the hairline between idle tabs is drawn only in colours the dark theme remaps', () => {
  const { view, divider } = mountIdlePair();
  assertRemapped(divider.className.split(/\s+/).filter((c) => COLOUR.test(c)), 'the hairline');
  view.unmount();
});

test("the ring cutting the unsaved dot out of the icon is a colour the dark theme remaps", () => {
  // Only the ring: the dot itself is gray-500, a mid grey that reads on both
  // strips and is meant to.
  const { view, dot } = mountUnsavedIdle();
  assertRemapped(dot.className.split(/\s+/).filter((c) => c.startsWith('ring-') && COLOUR.test(c)), 'the dot ring');
  view.unmount();
});

/** `--line-strong: #45475a;` and the rest, out of the `[data-theme="dark"] {` block. */
function darkTokens(): Map<string, string> {
  const css = readFileSync(join(ROOT, 'src/ui.css'), 'utf-8');
  const start = css.indexOf('[data-theme="dark"] {');
  assert.ok(start !== -1, 'ui.css no longer opens a [data-theme="dark"] token block');
  const block = css.slice(start, css.indexOf('}', start));
  return new Map([...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** The one-line remap rules, with each `var(--token)` replaced by its dark value. */
function darkSheet(): string {
  const tokens = darkTokens();
  return readFileSync(join(ROOT, 'src/ui.css'), 'utf-8')
    .split('\n')
    .filter((line) => /^\[data-theme="dark"\] \.[^{]+\{[^}]+\}\s*$/.test(line))
    .map((line) => line.replace(/var\((--[a-z-]+)\)/g, (whole, name: string) => tokens.get(name) ?? whole))
    .join('\n');
}

/** Runs `check` with the dark remaps cascading and `<html data-theme="dark">`. */
function inDark(check: (tokens: Map<string, string>) => void) {
  const style = document.createElement('style');
  style.textContent = darkSheet();
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-theme', 'dark');
  try {
    check(darkTokens());
  } finally {
    document.documentElement.removeAttribute('data-theme');
    style.remove();
  }
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** Every colour a hairline could end up drawn in: its border, or a fill. */
const inks = (el: HTMLElement) => {
  const style = getComputedStyle(el);
  return [style.borderLeftColor, style.backgroundColor].filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
};

test('in the dark theme the hairline is the strong line, and it shows on the strip', () => {
  inDark((tokens) => {
    const { view, strip, divider } = mountIdlePair();

    // The strip is what the hairline has to stand out against. If this fails
    // the cascade itself is not working, and the checks below mean nothing.
    assert.equal(getComputedStyle(strip).backgroundColor, rgb(tokens.get('--surface')!));

    // `bg-gray-300` matched no rule here, so the old hairline came out with no
    // ink at all — in the browser, that is Tailwind's light gray-300.
    assert.deepEqual(inks(divider), [rgb(tokens.get('--line-strong')!)]);
    view.unmount();
  });
});

test('in the dark theme the unsaved dot is ringed in the strip’s own colour', () => {
  inDark((tokens) => {
    const { view, strip, dot } = mountUnsavedIdle();
    const surface = tokens.get('--surface')!;
    assert.equal(getComputedStyle(strip).backgroundColor, rgb(surface));

    // The ring is Tailwind's `--tw-ring-color`, and the remap sets that
    // variable rather than a colour property. Before the remap nothing set it
    // here, so this read back empty — in the browser, Tailwind's gray-100.
    assert.equal(getComputedStyle(dot).getPropertyValue('--tw-ring-color').trim().toLowerCase(), surface.toLowerCase());
    view.unmount();
  });
});
