/**
 * `AppUpdateBanner` / `useAppUpdate` — "a new version is available", by poll.
 *
 * What is pinned: nothing renders while the deployed version matches the
 * running one; the banner appears when it differs, names both versions, and
 * its button does what the host said; a response that is not JSON or not ok
 * is ignored (the SPA fallback page, a deploy in progress); a hidden tab does
 * not poll and asks the moment it is shown; no version means no polling; and
 * polling stops once the update is known.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, flush, render, waitFor, waitForText } from './dom';
import AppUpdateBanner from '../src/shell/AppUpdateBanner';

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

/** A controllable `fetch`: `answer` decides each call, `calls` records them. */
function fakeFetch(answer: () => FakeResponse | Promise<FakeResponse>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown): FakeResponse => ({ ok: true, json: async () => body });

function withFetch<T>(fn: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return run().finally(() => { globalThis.fetch = original; });
}

/** jsdom's `visibilityState` is a prototype getter; shadow it on the instance. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}
function resetVisibility() {
  delete (document as unknown as { visibilityState?: string }).visibilityState;
}

/** A few timer turns, for asserting that something did NOT happen. */
async function settle(turns = 4) {
  for (let i = 0; i < turns; i += 1) {
    await act(async () => { await new Promise((r) => { setTimeout(r, 6); }); });
  }
}

test('renders nothing while the deployed version matches', async () => {
  const { fn, calls } = fakeFetch(() => json({ version: '2.27.0' }));
  await withFetch(fn, async () => {
    const view = render(<AppUpdateBanner currentVersion="2.27.0" pollMs={5} />);
    await settle();
    assert.equal(view.container.textContent, '');
    assert.ok(calls.length >= 1, 'it did ask');
    assert.match(calls[0].url, /^\/version\.json\?t=\d+$/);
    assert.equal(calls[0].init?.cache, 'no-store');
    view.unmount();
  });
});

test('shows both versions once the deployed one differs, and the button does what the host says', async () => {
  let deployed = '2.27.0';
  const { fn, calls } = fakeFetch(() => json({ version: deployed }));
  await withFetch(fn, async () => {
    let refreshed = 0;
    const view = render(
      <AppUpdateBanner currentVersion="2.27.0" pollMs={5} onRefresh={() => { refreshed += 1; }} />,
    );
    await settle(2);
    assert.equal(view.container.textContent, '');

    deployed = '3.0.0';
    await waitForText(/A new version is available\./);
    assert.match(view.container.textContent ?? '', /2\.27\.0 → 3\.0\.0/);

    const button = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Refresh now');
    assert.ok(button, 'the action is the catalog\'s "Refresh now"');
    act(() => { button!.click(); });
    assert.equal(refreshed, 1);

    // Known is known: no more asking.
    const asked = calls.length;
    await settle();
    assert.equal(calls.length, asked, 'polling stops once the update is known');
    view.unmount();
  });
});

test('a custom message and versionUrl are honoured', async () => {
  const { fn, calls } = fakeFetch(() => json({ version: '9.9.9' }));
  await withFetch(fn, async () => {
    const view = render(
      <AppUpdateBanner currentVersion="1.0.0" pollMs={5} versionUrl="/api/version/?portal=x" message="EFFICIENT has been updated." onRefresh={() => {}} />,
    );
    await waitForText(/EFFICIENT has been updated\./);
    assert.match(calls[0].url, /^\/api\/version\/\?portal=x&t=\d+$/, 'appends to an existing query');
    view.unmount();
  });
});

test('a response that is not ok, not JSON, or unreachable is ignored', async () => {
  let mode: 'not-ok' | 'html' | 'down' = 'not-ok';
  const { fn, calls } = fakeFetch(() => {
    if (mode === 'not-ok') return { ok: false, json: async () => ({ version: '3.0.0' }) };
    if (mode === 'html') return { ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    return Promise.reject(new TypeError('Failed to fetch'));
  });
  await withFetch(fn, async () => {
    const view = render(<AppUpdateBanner currentVersion="2.27.0" pollMs={5} />);
    await settle(2);
    mode = 'html';
    await settle(2);
    mode = 'down';
    await settle(2);
    assert.equal(view.container.textContent, '', 'no banner on any of the three');
    assert.ok(calls.length >= 3, 'and it kept trying');
    view.unmount();
  });
});

test('a hidden tab does not poll, and asks the moment it is shown', async () => {
  const { fn, calls } = fakeFetch(() => json({ version: '3.0.0' }));
  setVisibility('hidden');
  try {
    await withFetch(fn, async () => {
      const view = render(<AppUpdateBanner currentVersion="2.27.0" pollMs={5} onRefresh={() => {}} />);
      await settle();
      assert.equal(calls.length, 0, 'nothing asked while hidden');
      assert.equal(view.container.textContent, '');

      setVisibility('visible');
      act(() => { document.dispatchEvent(new window.Event('visibilitychange')); });
      await waitFor(() => calls.length >= 1, 'a check on becoming visible');
      await waitForText(/A new version is available\./);
      view.unmount();
    });
  } finally {
    resetVisibility();
  }
});

test('no current version means no polling at all', async () => {
  const { fn, calls } = fakeFetch(() => json({ version: '3.0.0' }));
  await withFetch(fn, async () => {
    const view = render(<AppUpdateBanner currentVersion="" pollMs={5} />);
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(view.container.textContent, '');
    view.unmount();
  });
});

test('unmounting stops the poll', async () => {
  const { fn, calls } = fakeFetch(() => json({ version: '2.27.0' }));
  await withFetch(fn, async () => {
    const view = render(<AppUpdateBanner currentVersion="2.27.0" pollMs={5} />);
    await settle(2);
    view.unmount();
    await flush();
    const asked = calls.length;
    await settle();
    assert.equal(calls.length, asked);
  });
});
