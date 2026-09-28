/**
 * The page-tab strip under the dark theme.
 *
 * Dark mode in this package is not a Tailwind variant: `ui.css` remaps class
 * names under `[data-theme="dark"]`, so a class with no remap keeps its light
 * value. The hairline between two idle tabs was `bg-gray-300`, which has none.
 * On the dark strip (`--surface`, #1e1e2e) it stayed light gray-300: a bright
 * bar between every pair of idle tabs, measured in the dealer portal and seen
 * in the customer portal on 2026-09-28. Every class string was right, so no
 * spec about markup noticed.
 *
 * Two checks. The first reads the remap list: whatever colours the hairline is
 * drawn with, ui.css has to remap them. The second cascades those remaps in
 * jsdom and reads the colour the hairline actually gets, against the strip's.
 * jsdom drops any declaration it cannot parse, and every remap is written as
 * `var(--token)`, so the tokens are substituted from the dark block first.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, useNavigate } from 'react-router-dom';

import { PageTabBar, PageTabsProvider, type ResolvePageTab } from '../src/page-tabs';
import { ROOT, darkRemaps } from './darkRemaps';

const resolve: ResolvePageTab = (loc) => ({ title: `Page ${loc.pathname.slice(1)}` });

let go: (to: string) => void = () => {};
function Nav() {
  const navigate = useNavigate();
  go = (to) => navigate(to);
  return null;
}

/** a (active) | b | c: one hairline, between b and c. */
function mountIdlePair() {
  const view = render(
    <MemoryRouter initialEntries={['/a']}>
      <PageTabsProvider resolve={resolve} confirmDiscard={async () => true}>
        <Nav />
        <PageTabBar />
      </PageTabsProvider>
    </MemoryRouter>,
  );
  for (const to of ['/b', '/c', '/a']) act(() => { go(to); });
  const list = view.container.querySelector('[role="tablist"]')!;
  const dividers = [...list.children].filter((el) => el.getAttribute('aria-hidden') === 'true') as HTMLElement[];
  assert.equal(dividers.length, 1, 'expected exactly one hairline, between the two idle tabs b and c');
  return { view, strip: list.parentElement as HTMLElement, divider: dividers[0] };
}

const COLOUR = /^(bg|border)-([a-z]+-\d{2,3}|white|black)(\/\d+)?$/;

test('the hairline between idle tabs is drawn only in colours the dark theme remaps', () => {
  const { view, divider } = mountIdlePair();
  const colours = divider.className.split(/\s+/).filter((c) => COLOUR.test(c));
  // Without this, a hairline that lost its colour class altogether would pass.
  assert.ok(colours.length > 0, `the hairline carries no colour class: "${divider.className}"`);

  const remaps = darkRemaps();
  const orphans = colours.filter((c) => !remaps.has(c));
  assert.deepEqual(
    orphans,
    [],
    'these stay light on the dark strip because ui.css does not remap them:\n  ' + orphans.join('\n  '),
  );
  view.unmount();
});

/** `--line-strong: #45475a;` and the rest, out of the `[data-theme="dark"] {` block. */
function darkTokens(css: string): Map<string, string> {
  const start = css.indexOf('[data-theme="dark"] {');
  assert.ok(start !== -1, 'ui.css no longer opens a [data-theme="dark"] token block');
  const block = css.slice(start, css.indexOf('}', start));
  return new Map([...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** The one-line remap rules, with each `var(--token)` replaced by its dark value. */
function darkSheet(): string {
  const css = readFileSync(join(ROOT, 'src/ui.css'), 'utf-8');
  const tokens = darkTokens(css);
  return css
    .split('\n')
    .filter((line) => /^\[data-theme="dark"\] \.[^{]+\{[^}]+\}\s*$/.test(line))
    .map((line) => line.replace(/var\((--[a-z-]+)\)/g, (whole, name: string) => tokens.get(name) ?? whole))
    .join('\n');
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
  const style = document.createElement('style');
  style.textContent = darkSheet();
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-theme', 'dark');
  try {
    const { view, strip, divider } = mountIdlePair();
    const tokens = darkTokens(readFileSync(join(ROOT, 'src/ui.css'), 'utf-8'));

    // The strip is what the hairline has to stand out against. If this fails
    // the cascade itself is not working, and the checks below mean nothing.
    assert.equal(getComputedStyle(strip).backgroundColor, rgb(tokens.get('--surface')!));

    // `bg-gray-300` matched no rule here, so the old hairline came out with no
    // ink at all — in the browser, that is Tailwind's light gray-300.
    assert.deepEqual(inks(divider), [rgb(tokens.get('--line-strong')!)]);
    view.unmount();
  } finally {
    document.documentElement.removeAttribute('data-theme');
    style.remove();
  }
});
