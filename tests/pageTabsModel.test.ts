/**
 * Page tabs' state rules, without React or a router.
 *
 * These are the decisions a user notices: which tab a navigation lands on,
 * which tab goes when there are too many (never the one on screen, never one
 * holding unsaved work, never a pinned home page), where closing the tab on
 * screen goes, and what a reload brings back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginClose,
  emptyState,
  ensurePinned,
  keysToClose,
  neighbourOf,
  removeTab,
  restore,
  serialize,
  setDirty,
  setTitle,
  visit,
  type TabEntry,
  type TabsState,
} from '../src/page-tabs/tabsModel';

const entry = (path: string, title = path, key = path.split(/[?#]/)[0]): TabEntry => ({ key, path, title });
const keys = (s: TabsState) => s.tabs.map((t) => t.key);

function open(...paths: string[]): TabsState {
  return paths.reduce((s, p) => visit(s, entry(p)), emptyState());
}

test('visiting a new address opens a tab at the end and makes it active', () => {
  const s = open('/orders', '/orders/41');
  assert.deepEqual(keys(s), ['/orders', '/orders/41']);
  assert.equal(s.activeKey, '/orders/41');
  assert.deepEqual(s.mounted, ['/orders', '/orders/41']);
});

test('the same pathname is the same tab: a filter change moves it, not duplicates it', () => {
  const s = visit(open('/orders', '/orders/41'), entry('/orders?status=open'));
  assert.deepEqual(keys(s), ['/orders', '/orders/41']);
  assert.equal(s.activeKey, '/orders');
  assert.equal(s.tabs[0].path, '/orders?status=open', 'clicking the tab returns to the filtered list');
});

test('a title the page set survives navigation within its tab', () => {
  let s = open('/orders/41');
  s = setTitle(s, '/orders/41', 'SO-0041');
  s = visit(s, entry('/orders/41#lines', 'Order'));
  assert.equal(s.tabs[0].title, 'SO-0041');
  assert.equal(s.tabs[0].titleFrom, 'page');
});

test('past the limit, the least recently used tab goes', () => {
  let s = open('/a', '/b', '/c');
  s = visit(s, entry('/a')); // /a is now more recent than /b
  s = visit(s, entry('/d'), 3);
  assert.deepEqual(keys(s), ['/a', '/c', '/d'], '/b was the least recently used');
});

test('eviction spares the tab on screen, unsaved work and pinned tabs', () => {
  let s = ensurePinned(open('/b', '/c'), [entry('/home')]);
  s = setDirty(s, '/b', true);
  // /home pinned, /b dirty, /c is next — and the new tab is on screen.
  s = visit(s, entry('/d'), 3);
  assert.deepEqual(keys(s), ['/home', '/b', '/d'], '/c was the only tab that could go');
  // Nothing left that may go: the strip runs long instead of losing work.
  s = setDirty(s, '/d', true);
  s = visit(s, entry('/e'), 3);
  assert.deepEqual(keys(s), ['/home', '/b', '/d', '/e']);
});

test('closing the tab on screen goes right, else left — and the page stays until the address moves', () => {
  const s = open('/a', '/b', '/c');
  assert.equal(neighbourOf(s, '/b')?.key, '/c');
  assert.equal(neighbourOf(s, '/c')?.key, '/b');

  let closing = beginClose(visit(s, entry('/b')), '/b');
  assert.ok(closing.tabs.some((t) => t.key === '/b'), 'still mounted while the address is on it');
  closing = visit(closing, entry('/c'));
  assert.deepEqual(keys(closing), ['/a', '/c']);
  assert.equal(closing.closing, null);
});

test('returning to a closing tab before the address moves cancels the close', () => {
  let s = beginClose(open('/a', '/b'), '/b');
  s = visit(s, entry('/b'));
  assert.deepEqual(keys(s), ['/a', '/b']);
  assert.equal(s.closing, null);
});

test('bulk closes never take a pinned tab', () => {
  const s = ensurePinned(open('/a', '/b', '/c'), [entry('/home')]);
  assert.deepEqual(keysToClose(s, 'all', null), ['/a', '/b', '/c']);
  assert.deepEqual(keysToClose(s, 'others', '/b'), ['/a', '/c']);
  assert.deepEqual(keysToClose(s, 'right', '/a'), ['/b', '/c']);
  assert.deepEqual(keysToClose(s, 'right', '/c'), []);
});

test('removing a tab forgets its mounted and dirty marks', () => {
  let s = setDirty(open('/a', '/b'), '/a', true);
  s = removeTab(s, '/a');
  assert.deepEqual(s.mounted, ['/b']);
  assert.deepEqual(s.dirty, []);
});

test('pinned tabs lead the strip, whatever order they were saved in', () => {
  const s = ensurePinned(open('/a', '/home', '/b'), [entry('/home')]);
  assert.deepEqual(keys(s), ['/home', '/a', '/b']);
  assert.equal(s.tabs[0].pinned, true);
});

test('a reload restores the strip, re-deciding each tab against today’s routes', () => {
  let s = open('/orders?status=open', '/orders/41', '/retired');
  s = setTitle(s, '/orders/41', 'SO-0041');
  const raw = serialize(s);

  const resolve = (path: string) => (path.startsWith('/retired') ? null : entry(path, 'Route title'));
  const tabs = restore(raw, resolve);
  assert.deepEqual(tabs.map((t) => t.path), ['/orders?status=open', '/orders/41'], 'a retired route is dropped');
  assert.equal(tabs[1].title, 'SO-0041', "the page's own title is kept");
  assert.equal(tabs[0].title, 'Route title', "a route title is re-read — today's name wins");
});

test('a corrupt or foreign saved value restores nothing rather than throwing', () => {
  const resolve = (path: string) => entry(path);
  assert.deepEqual(restore('not json', resolve), []);
  assert.deepEqual(restore('{"v":2,"tabs":[]}', resolve), []);
  assert.deepEqual(restore('{"v":1,"tabs":[{"path":"https://evil.example/"}]}', resolve), []);
  assert.deepEqual(restore('{"v":1,"tabs":[{"path":"//evil.example/x"}]}', resolve), [], 'protocol-relative is another origin');
  assert.deepEqual(
    restore('{"v":1,"tabs":[{"path":"/a#_imp=secret"}]}', resolve).map((t) => t.path),
    ['/a'],
    'a fragment is dropped on the way in',
  );
  assert.deepEqual(restore(null, resolve), []);
});

test('a tab mid-close is not saved', () => {
  const s = beginClose(open('/a', '/b'), '/b');
  assert.deepEqual(JSON.parse(serialize(s)).tabs.map((t: { key: string }) => t.key), ['/a']);
});
