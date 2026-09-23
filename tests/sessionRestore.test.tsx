/**
 * SessionWindowRestore — window state is in-memory, so login or F5 always
 * meant an empty desktop. The component saves each open window's identifying
 * refs through ShellPrefs and replays them on a fresh mount.
 *
 * Contracts pinned here: a saved page window reopens; `restore_windows:
 * false` disables the replay; opening a window persists its ref (debounced);
 * and mounting with an empty desktop does NOT overwrite the saved set before
 * the restore has had its chance — the ordering bug that would make the
 * feature erase its own input.
 *
 * The same erase, from the other side: a backend consumer's prefs arrive
 * AFTER mount (the admin portal reads them from /auth/me/), so the restore
 * reads an empty set and the desktop stays empty. Writing that empty desktop
 * back wiped the saved set, and the next load had nothing to restore. Only a
 * change to the open windows is written now — `makeServerPrefs` is that
 * consumer, with a new `save` on every render as the portal's adapter has.
 *
 * A write is recorded as saved only once it SETTLES. Recording it when it was
 * fired meant a rejected save left the shell believing a lost write had landed,
 * with every later comparison equal and no retry — `makeAsyncServerPrefs` holds
 * a write open to pin that, and the no-double-write rule across the same gap.
 *
 * Mounted like windowDirty.test.tsx: real WindowManagerProvider, MemoryRouter
 * + QueryClientProvider, a registry entry per scenario.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import { ShellPrefsProvider, type ShellPrefsAdapter } from '../src/shell/ShellPrefs';
import SessionWindowRestore, { sameSessionRefs, toSessionRefs } from '../src/shell/SessionRestore';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ROUTE = '/session-restore-test';
const OTHER_ROUTE = '/session-restore-other';
setShellWindowRegistry({
  [ROUTE]: { label: 'Session restore test', component: () => <div data-testid="restored-page" /> } as never,
  [OTHER_ROUTE]: { label: 'Session restore other', component: () => <div data-testid="other-page" /> } as never,
});

/** A controllable prefs adapter whose writes land synchronously in `store`. */
function makePrefs(initial: Record<string, unknown>) {
  const store: Record<string, unknown> = { ...initial };
  const adapter: ShellPrefsAdapter = {
    prefs: store,
    save: patch => { Object.assign(store, patch); },
  };
  return { store, adapter };
}

let opener: ReturnType<typeof useWindowManager> | null = null;
function CaptureManager() {
  opener = useWindowManager();
  return null;
}

/** A backend consumer's adapter, shaped like the admin portal's (prefs come
 *  from /auth/me/ through React Query): the saved prefs live on `server`, and
 *  every render hands the shell a new `save`. With `ready: false` the prefs the
 *  shell sees are empty until the fetch answers (`arrive()`). `writes` records
 *  every patch; `rerender()` re-renders the adapter without changing prefs. */
function makeServerPrefs(initial: Record<string, unknown>, { ready }: { ready: boolean }) {
  const server: Record<string, unknown> = { ...initial };
  const writes: Record<string, unknown>[] = [];
  let deliver = () => {};
  let bump = () => {};
  function ServerPrefsProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<Record<string, unknown>>(() => (ready ? { ...server } : {}));
    const [, setTick] = useState(0);
    deliver = () => setPrefs({ ...server });
    bump = () => setTick(t => t + 1);
    const adapter: ShellPrefsAdapter = {
      prefs,
      save: patch => {
        writes.push(patch);
        Object.assign(server, patch);
        setPrefs(prev => ({ ...prev, ...patch }));
      },
    };
    return <ShellPrefsProvider value={adapter}>{children}</ShellPrefsProvider>;
  }
  return {
    server, writes, ServerPrefsProvider,
    arrive: () => act(async () => { deliver(); }),
    rerender: () => act(async () => { bump(); }),
  };
}

function mountIn(Prefs: (props: { children: ReactNode }) => ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <Prefs>
          <WindowManagerProvider>
            <SessionWindowRestore />
            <CaptureManager />
          </WindowManagerProvider>
        </Prefs>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function mount(adapter: ShellPrefsAdapter) {
  return mountIn(({ children }) => <ShellPrefsProvider value={adapter}>{children}</ShellPrefsProvider>);
}

const settle = async (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

/** Like `makeServerPrefs`, but each write is a promise the test settles by
 *  hand, so the window between firing a save and it landing is observable.
 *  A new `save` on every render, as the portal adapters have.
 *
 *  Note `settleWrite(false)` is the contract the shell needs from an adapter
 *  that lets a failed PATCH reach it. The EFFICIENT portal adapters currently
 *  catch their own rejection before returning, so there this resolves either
 *  way — see the note in SessionRestore's persist effect. */
function makeAsyncServerPrefs(initial: Record<string, unknown>) {
  const server: Record<string, unknown> = { ...initial };
  const writes: Record<string, unknown>[] = [];
  const inflight: { resolve: () => void; reject: () => void }[] = [];
  let bump = () => {};
  function AsyncPrefsProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<Record<string, unknown>>(() => ({ ...server }));
    const [, setTick] = useState(0);
    bump = () => setTick(t => t + 1);
    const adapter: ShellPrefsAdapter = {
      prefs,
      save: patch => {
        writes.push(patch);
        return new Promise<void>((resolve, reject) => {
          inflight.push({
            resolve: () => {
              Object.assign(server, patch);
              setPrefs(prev => ({ ...prev, ...patch }));
              resolve();
            },
            reject: () => reject(new Error('PATCH failed')),
          });
        });
      },
    };
    return <ShellPrefsProvider value={adapter}>{children}</ShellPrefsProvider>;
  }
  return {
    server, writes, AsyncPrefsProvider,
    settleWrite: (ok: boolean) => act(async () => {
      const write = inflight.shift();
      assert.ok(write, 'expected a write in flight');
      if (ok) write.resolve();
      else write.reject();
    }),
    rerender: () => act(async () => { bump(); }),
  };
}

test('a saved page window reopens on mount', async () => {
  const { adapter } = makePrefs({ session_windows: [{ type: 'page', route: ROUTE }] });
  const view = mount(adapter);
  await settle(20);
  assert.ok(document.querySelector('[data-testid="restored-page"]'), 'the saved window should be open');
  await act(async () => { view.unmount(); });
});

test('restore_windows: false disables the replay', async () => {
  const { adapter } = makePrefs({
    restore_windows: false,
    session_windows: [{ type: 'page', route: ROUTE }],
  });
  const view = mount(adapter);
  await settle(20);
  assert.equal(document.querySelector('[data-testid="restored-page"]'), null);
  await act(async () => { view.unmount(); });
});

test('opening a window persists its ref (debounced)', async () => {
  const { store, adapter } = makePrefs({ restore_windows: false, session_windows: [{ type: 'page', route: ROUTE }] });
  const view = mount(adapter);
  // A route other than the saved one: the write is only observable when the
  // desktop differs from what is already saved.
  await act(async () => { opener!.openPage(OTHER_ROUTE); });
  await settle(900);
  assert.deepEqual(store.session_windows, [{ type: 'page', route: OTHER_ROUTE }]);
  await act(async () => { view.unmount(); });
});

test('prefs that arrive after mount miss the replay but never erase the saved set', async () => {
  const saved = [{ type: 'page', route: ROUTE }];
  const { server, writes, ServerPrefsProvider, arrive } = makeServerPrefs({ session_windows: saved }, { ready: false });
  const view = mountIn(ServerPrefsProvider);
  await settle(50);
  await arrive();
  await settle(900);
  // The documented trade-off: a consumer whose prefs hydrate after mount
  // misses the replay for that load rather than restoring mid-session.
  assert.equal(document.querySelector('[data-testid="restored-page"]'), null);
  // What it must never do is write the empty desktop over the set it could
  // not read, or the next load has nothing to restore either.
  assert.deepEqual(writes, []);
  assert.deepEqual(server.session_windows, saved);
  await act(async () => { view.unmount(); });
});

test('after a missed replay, the window the user opens next is saved', async () => {
  const { server, ServerPrefsProvider, arrive } = makeServerPrefs(
    { session_windows: [{ type: 'page', route: ROUTE }] }, { ready: false },
  );
  const view = mountIn(ServerPrefsProvider);
  await settle(50);
  await arrive();
  await act(async () => { opener!.openPage(OTHER_ROUTE); });
  await settle(900);
  assert.deepEqual(server.session_windows, [{ type: 'page', route: OTHER_ROUTE }]);
  await act(async () => { view.unmount(); });
});

test('a replay writes nothing back, however often the adapter re-renders', async () => {
  const saved = [{ type: 'page', route: ROUTE }];
  const { writes, ServerPrefsProvider, rerender } = makeServerPrefs({ session_windows: saved }, { ready: true });
  const view = mountIn(ServerPrefsProvider);
  await settle(20);
  assert.ok(document.querySelector('[data-testid="restored-page"]'), 'the saved window should be open');
  for (let i = 0; i < 3; i++) {
    await rerender();
    await settle(300);
  }
  await settle(900);
  assert.deepEqual(writes, [], 'the desktop still matches the saved set, so there is nothing to write');
  await act(async () => { view.unmount(); });
});

test('closing the window the user just opened, inside the debounce, writes nothing', async () => {
  const { writes, ServerPrefsProvider } = makeServerPrefs({}, { ready: true });
  const view = mountIn(ServerPrefsProvider);
  await settle(20);
  await act(async () => { opener!.openPage(OTHER_ROUTE); });
  await settle(100);
  await act(async () => { opener!.closeEntity(`page:${OTHER_ROUTE}`); });
  await settle(900);
  assert.deepEqual(writes, []);
  await act(async () => { view.unmount(); });
});

test('a rejected save leaves the saved set, so the next change writes again', async () => {
  const { writes, server, AsyncPrefsProvider, settleWrite, rerender } = makeAsyncServerPrefs({});
  const view = mountIn(AsyncPrefsProvider);
  await settle(20);
  await act(async () => { opener!.openPage(ROUTE); });
  await settle(900);
  assert.equal(writes.length, 1, 'the open is written once');
  // The PATCH fails. Recording the set as saved here is what stranded the
  // shell: every later comparison comes out equal and the write is never
  // retried, so the server keeps the set from before the change.
  await settleWrite(false);
  assert.equal(server.session_windows, undefined, 'nothing reached the server');
  // A render is all it takes to notice the desktop and the saved set differ.
  await rerender();
  await settle(900);
  assert.equal(writes.length, 2, 'the lost write is retried');
  assert.deepEqual(writes[1], { session_windows: [{ type: 'page', route: ROUTE }] });
  await settleWrite(true);
  assert.deepEqual(server.session_windows, [{ type: 'page', route: ROUTE }]);
  await act(async () => { view.unmount(); });
});

test('a write still in flight is not fired a second time', async () => {
  const { writes, AsyncPrefsProvider, settleWrite, rerender } = makeAsyncServerPrefs({});
  const view = mountIn(AsyncPrefsProvider);
  await settle(20);
  await act(async () => { opener!.openPage(ROUTE); });
  await settle(900);
  assert.equal(writes.length, 1);
  // The round-trip outlasts several renders, each handing over a new `save`.
  // Waiting for the settle rather than the dispatch is what opens this window.
  for (let i = 0; i < 3; i++) {
    await rerender();
    await settle(900);
  }
  assert.equal(writes.length, 1, 'the same set must not be written twice');
  await settleWrite(true);
  await rerender();
  await settle(900);
  assert.equal(writes.length, 1, 'and once it lands there is still nothing to write');
  await act(async () => { view.unmount(); });
});

test('toSessionRefs keeps only what the registry can reopen', () => {
  const refs = toSessionRefs([
    { id: '1', type: 'page', label: 'Orders', route: '/orders' },
    { id: '2', type: 'modal', label: 'SO-1', entityType: 'sales_order', entityId: 'abc', route: '/orders' },
    { id: '3', type: 'part_number', label: '00620' },
    { id: '4', type: 'modal', label: 'No identity' },
  ] as never);
  assert.deepEqual(refs, [
    { type: 'page', route: '/orders' },
    { type: 'entity', entityType: 'sales_order', entityId: 'abc', label: 'SO-1', route: '/orders' },
  ]);
});

test('sameSessionRefs ignores key order, not content or order', () => {
  const entity = { type: 'entity', entityType: 'sales_order', entityId: 'abc', label: 'SO-1', route: '/orders' } as const;
  // Postgres jsonb hands keys back sorted by length: type, label, route, …
  const fromJsonb = JSON.parse('{"type":"entity","label":"SO-1","route":"/orders","entityId":"abc","entityType":"sales_order"}');
  const page = { type: 'page', route: '/orders' } as const;
  assert.equal(sameSessionRefs([page, entity], [page, fromJsonb]), true);
  assert.equal(sameSessionRefs([page, entity], [entity, page]), false, 'order is part of the set');
  assert.equal(sameSessionRefs([entity], [{ ...entity, label: 'SO-2' }]), false, 'a relabelled window is a change');
  assert.equal(sameSessionRefs([page], [page, entity]), false);
  assert.equal(sameSessionRefs([], []), true);
});
