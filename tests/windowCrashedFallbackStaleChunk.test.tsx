/**
 * `WindowCrashedFallback` — a missing chunk is offered "Reload page", not a remount.
 *
 * A window that crashed because its lazy chunk is gone from the server (a
 * deploy replaced the build under the tab) cannot be fixed by resetting the
 * boundary: the remount imports the same missing file. The fallback names
 * what happened and offers the one thing that works. Every other crash keeps
 * the message and the "Reload window" remount it always had.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { WindowCrashedFallback } from '../src/shell/WindowErrorBoundary';

const noop = () => {};

test('a stale chunk gets "Reload page" and an explanation instead of the raw message', () => {
  const html = renderToStaticMarkup(
    <WindowCrashedFallback
      error={new TypeError('Failed to fetch dynamically imported module: https://x/assets/ProposalList-BJSol4DP.js')}
      onReload={noop}
    />,
  );
  assert.match(html, /This window needs the latest version of the app/);
  assert.match(html, /A new version was deployed while this tab was open/);
  assert.match(html, />Reload page</);
  assert.doesNotMatch(html, /Reload window/);
  assert.doesNotMatch(html, /ProposalList-BJSol4DP/, 'the chunk URL is noise to a user');
});

test('any other crash keeps its message and the remount', () => {
  const html = renderToStaticMarkup(
    <WindowCrashedFallback error={new TypeError("Cannot read properties of undefined (reading 'map')")} onReload={noop} />,
  );
  assert.match(html, /This window crashed/);
  assert.match(html, /Cannot read properties of undefined/);
  assert.match(html, />Reload window</);
  assert.doesNotMatch(html, /Reload page/);
});
