/**
 * Which app a stored file opens in, and how its bytes get there.
 *
 * The routing is the whole point of the util, and every branch of it is a
 * decision someone will otherwise re-make per portal: a PDF and a screenshot
 * belong in Preview, a CSV in Spreadsheet, a workbook is a download because
 * parsing untrusted bytes in the host's origin is not worth a preview, and a
 * docx leaves for a tab — but says so first, or it reads as a failure.
 *
 * The `fetchBlob` transport is pinned separately because it is the half that
 * exists for a production failure: a presigned/CDN URL opens fine in a tab and
 * cannot be fetched by the viewer, so the caller's API client fetches it and
 * the window shows a placeholder until the bytes land. A rejection has to end
 * as a message in that window — the earlier shape left it on "loading" for
 * ever, which is indistinguishable from a slow file.
 */
// A DOM first — the stage dispatches a CustomEvent at `window` and toasts
// measure themselves with rAF, and `./dom` installs both. Taken as a BINDING,
// not a bare `import './dom'`: the package declares `sideEffects`, so the
// bundler drops a side-effect-only import from a `.ts` spec and the globals
// never land (the symptom is "requestAnimationFrame is not defined", followed
// by jsdom refusing an event built by Node's own CustomEvent).
import { flush } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openAttachment, attachmentKind } from '../src/apps/openAttachment';
import { peekPdfPreviewStage, claimPdfPreviewStage } from '../src/apps/_previewStage';
import { peekSpreadsheetPreviewStage, claimSpreadsheetPreviewStage } from '../src/apps/_spreadsheetStage';

/** Drain the Preview stage the way a mounting window does. */
function drainPreview() {
  const stage = peekPdfPreviewStage();
  if (stage) claimPdfPreviewStage(stage);
  return stage;
}

function drainSpreadsheet() {
  const stage = peekSpreadsheetPreviewStage();
  if (stage) claimSpreadsheetPreviewStage(stage);
  return stage;
}

function pages() {
  const opened: string[] = [];
  return { opened, openPage: (p: string) => { opened.push(p); } };
}

/** What the toast container is showing right now. */
const toastText = async () => {
  await flush();
  return document.getElementById('toast-container')?.textContent ?? '';
};

/** What the util handed to the browser instead of to a window. */
const tabs: string[] = [];
window.open = ((url: string) => { tabs.push(url); return null; }) as typeof window.open;
// jsdom has no object URLs; the specs only care that one was made.
URL.createObjectURL = () => 'blob:stub';

test('classifies by extension, and answers null for what no viewer renders', () => {
  assert.equal(attachmentKind('brief.pdf'), 'pdf');
  assert.equal(attachmentKind('shot.PNG'), 'image');
  assert.equal(attachmentKind('plan.dxf'), 'dxf');
  assert.equal(attachmentKind('hub.step'), '3d');
  assert.equal(attachmentKind('rows.csv'), 'csv');
  assert.equal(attachmentKind('notes.docx'), null);
  // A presigned URL carries its signature in the query string; the extension
  // is still the one before it.
  assert.equal(attachmentKind('https://cdn.example/x/brief.pdf?sig=abc&x=1'), 'pdf');
});

test('a PDF goes to Preview with the URL when the page can fetch it', async () => {
  const { opened, openPage } = pages();
  await openAttachment({ filename: 'brief.pdf', url: '/media/brief.pdf' }, openPage);

  assert.deepEqual(opened, ['/preview']);
  const staged = drainPreview();
  assert.equal(staged?.data.url, '/media/brief.pdf');
  assert.equal(staged?.data.kind, 'pdf');
  assert.equal(staged?.data.filename, 'brief.pdf');
});

test('a CSV goes to Spreadsheet as text, not to Preview', async () => {
  const { opened, openPage } = pages();
  await openAttachment(
    { filename: 'rows.csv', url: '/media/rows.csv' },
    openPage,
    { fetchBlob: async () => new Blob(['a,b\n1,2\n']) },
  );

  assert.deepEqual(opened, ['/spreadsheet']);
  assert.equal(drainSpreadsheet()?.data.csv, 'a,b\n1,2\n');
  assert.equal(peekPdfPreviewStage(), null, 'nothing should be staged for Preview');
});

test('a type no viewer renders leaves for a tab, and says so', async () => {
  const { opened, openPage } = pages();
  tabs.length = 0;
  await openAttachment({ filename: 'spec.docx', url: 'https://cdn.example/spec.docx' }, openPage);

  assert.deepEqual(opened, [], 'no shell window opens for a file it cannot show');
  assert.deepEqual(tabs, ['https://cdn.example/spec.docx']);
  // Silently jumping to a tab is the behaviour this rule replaced; the reader
  // is told why this one is the exception.
  assert.match(await toastText(), /no viewer can show it here/i);
});

test('a workbook stays a download rather than being parsed in this origin', async () => {
  const { opened, openPage } = pages();
  tabs.length = 0;
  await openAttachment({ filename: 'ledger.xlsx', url: 'https://cdn.example/ledger.xlsx' }, openPage);

  assert.deepEqual(opened, []);
  assert.deepEqual(tabs, ['https://cdn.example/ledger.xlsx']);
  assert.match(await toastText(), /preview is unavailable/i);
});

test('fetchBlob opens the window on a placeholder, then swaps the file in', async () => {
  const { opened, openPage } = pages();
  let resolve!: (b: Blob) => void;
  const pending = new Promise<Blob>(r => { resolve = r; });

  const call = openAttachment(
    { filename: 'report.pdf', url: 'https://cdn.example/report.pdf?sig=1' },
    openPage,
    { fetchBlob: () => pending, loadingMessage: 'LOADING PDF' },
  );

  // The window is open before the bytes exist — that is the point.
  assert.deepEqual(opened, ['/preview']);
  const staged = peekPdfPreviewStage();
  assert.equal(staged?.data.converting, true);
  assert.equal(staged?.data.convertingMessage, 'LOADING PDF');

  resolve(new Blob(['%PDF-1.4']));
  await call;
  assert.equal(staged?.data.converting, undefined, 'the placeholder is replaced, not kept');
  assert.ok(staged?.data.url?.startsWith('blob:'), 'the viewer reads the fetched bytes');
  drainPreview();
});

test('a failed fetch says why in the window instead of loading for ever', async () => {
  const { opened, openPage } = pages();
  await openAttachment(
    { filename: 'report.pdf', url: 'https://cdn.example/report.pdf?sig=1' },
    openPage,
    { fetchBlob: async () => { throw new Error('You do not have access to this file.'); } },
  );

  assert.deepEqual(opened, ['/preview']);
  const staged = drainPreview();
  assert.equal(staged?.data.converting, false);
  assert.equal(staged?.data.convertingMessage, 'You do not have access to this file.');
  assert.equal(staged?.data.url, undefined, 'nothing to render, so nothing is claimed to render');
});
