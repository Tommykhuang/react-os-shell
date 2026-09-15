/**
 * `MilestoneTimeline variant="rail"` — the bar alone, under a stepper that has
 * already named the stages.
 *
 * The card variant answers "what happened, when, and what is it called" on the
 * bar itself: two label lanes, `×N` pills, a pending column, a break glyph on
 * the stretch it cut. The mould window puts a five-step progress bar directly
 * above it, so all of that was said twice — "way too complex, and very hard to
 * read" (Victor Mau, 2026-09-15). The rail says it once: every milestone is a
 * dot with a popover, a revision carries a two-character caption, the edge
 * captions flank the rail, nothing is cut, and what has not happened is one
 * dashed cap at the end of a dashed tail. The stepper and the rail then point
 * at each other: `highlightKeys` lights a stretch of the rail for a hovered
 * step, `onHoverChange` names the milestone under the pointer for the stepper.
 *
 * The claims are structural — which parts exist, which do not, where a band
 * starts — and asserted against the geometry helper's own answer rather than
 * a pasted float.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import MilestoneTimeline, { type Milestone } from '../src/shell/MilestoneTimeline';
import { compressTimeAxis } from '../src/shell/timelineGeometry';
import { toDayMs } from '../src/shell/timelineDates';
import { withConsoleError } from './capture-console';

const day = (iso: string) => toDayMs(iso)!;

/** The track width every static render assumes — see `milestoneTimeline.test.tsx`. */
const TRACK = 600;
/** What a bare rail keeps back for the tail to its cap. */
const CAP_TAIL = 36;

const staticHtml = (element: React.ReactElement) =>
  withConsoleError(() => renderToStaticMarkup(element)).result;

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The captions band alone — from its marker to the close of its `<div>`. */
function captionsBlock(html: string): string {
  const at = html.indexOf('data-timeline-part="captions"');
  assert.notEqual(at, -1, `no captions band in: ${html}`);
  return html.slice(at, html.indexOf('</div>', at));
}

/** The `left`/`width` a part was placed at, as its style attribute states. */
function placed(html: string, part: string): { left: number; width: number } {
  const hit = html.match(new RegExp(`data-timeline-part="${part}"[^>]*style="([^"]*)"`));
  assert.ok(hit, `no ${part} in: ${html}`);
  const left = hit[1].match(/left:([0-9.]+)px/);
  const width = hit[1].match(/width:([0-9.]+)px/);
  assert.ok(left && width, `${part} has no left/width: ${hit[1]}`);
  return { left: Number(left[1]), width: Number(width[1]) };
}

/** The classes on the node announced as `label`. */
function nodeClasses(html: string, label: string): string {
  const hit = html.match(new RegExp(`<button[^>]*aria-label="${label}[^"]*"[^>]*>`));
  assert.ok(hit, `no node announced as "${label}" in: ${html}`);
  const classes = hit[0].match(/class="([^"]*)"/);
  return classes ? classes[1] : '';
}

const hover = (el: Element) => act(() => {
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
});
const unhover = (el: Element) => act(() => {
  el.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
});

/**
 * Mould 314/20P1, as the customer portal passes it: four revisions inside
 * three weeks, a fifth the day after the drawing was confirmed, a sixth ten
 * months later, a sample ORDERED but not shipped, and no production-ready date
 * — so the window runs to the day the card was read.
 */
const MOULD: Milestone[] = [
  { key: 'initiation', label: 'Project Initiated', date: '2025-06-10', glyph: 'flag' },
  { key: 'dfm-1', label: 'DFM v1', date: '2025-07-03', kind: 'dfm', caption: 'v1' },
  { key: 'dfm-2', label: 'DFM v2', date: '2025-07-10', kind: 'dfm', caption: 'v2' },
  { key: 'dfm-3', label: 'DFM v3', date: '2025-07-17', kind: 'dfm', caption: 'v3' },
  { key: 'dfm-4', label: 'DFM v4', date: '2025-07-24', kind: 'dfm', caption: 'v4' },
  { key: 'dfm_confirmed', label: 'DFM Confirmed', date: '2025-07-29', glyph: 'doc' },
  { key: 'dfm-5', label: 'DFM v5', date: '2025-07-30', kind: 'dfm', caption: 'v5' },
  { key: 'mould_complete', label: 'Mould Complete', date: '2025-10-08', kind: 'completion' },
  { key: 'dfm-6', label: 'DFM v6', date: '2026-08-25', kind: 'dfm', caption: 'v6' },
  { key: 'sample_shipped', label: 'Sample ordered', date: '2026-09-09', kind: 'shipment', provisional: true },
  { key: 'production_ready', label: 'Production Ready', date: null, kind: 'completion' },
];
const MOULD_END = '2026-09-15';
const MOULD_DATED = MOULD.filter((m) => m.date).map((m) => day(m.date!));

/** The axis the rail builds for that fixture: nothing cut, the 48 px floor
 *  kept, and the track short of the layer by the tail to the cap. */
const MOULD_AXIS = compressTimeAxis(
  [...MOULD_DATED, day(MOULD_END)],
  TRACK - CAP_TAIL,
  { maxTimeShare: Infinity },
);

const rail = (extra: Partial<React.ComponentProps<typeof MilestoneTimeline>> = {}) => (
  <MilestoneTimeline
    title="Mould development for 314/20P1"
    variant="rail"
    milestones={MOULD}
    endDate={MOULD_END}
    edgeCaptions={{ start: 'Start', end: 'Ready' }}
    {...extra}
  />
);

test('the rail is the bar alone: no card, no heading, no label under any dot, no pending column', () => {
  const html = staticHtml(rail());
  assert.match(html, /data-timeline-variant="rail"/);
  assert.doesNotMatch(html, /rosh-tl-card/, 'no card chrome');
  assert.doesNotMatch(html, /rosh-tl-title/, 'no heading');
  assert.equal(count(html, 'data-timeline-part="label"'), 0, 'no lane label');
  assert.equal(count(html, 'data-timeline-part="cluster"'), 0, 'no ×N pill');
  assert.doesNotMatch(html, /data-timeline-part="pending"/, 'no pending column');
  assert.doesNotMatch(html, /Not yet reached<\/p>/, 'and no "Not yet reached" heading on the bar');
  // Every dated milestone is still a dot that announces itself, so nothing was
  // lost with the labels — it moved into the popover and the accessible name.
  assert.equal(count(html, 'data-timeline-node="item"'), 10);
  assert.match(html, /aria-label="Mould Complete · 08\/10\/2025"/);
});

test('the edge captions flank the rail on its own row, and nothing is drawn inside the stage for them', () => {
  const html = staticHtml(rail());
  const start = html.match(/<span[^>]*class="rosh-tl-flank"[^>]*data-timeline-part="start-caption"[^>]*>Start<\/span>/);
  const end = html.match(/<span[^>]*class="rosh-tl-flank is-end"[^>]*data-timeline-part="end-caption"[^>]*>Ready<\/span>/);
  assert.ok(start, `no flanking start caption in: ${html}`);
  assert.ok(end, `no flanking end caption in: ${html}`);
  assert.doesNotMatch(html, /rosh-tl-edge/, 'the in-stage caption is the card variant\'s');
  // The stage sits between them.
  assert.ok(html.indexOf('start-caption') < html.indexOf('rosh-tl-stage'));
  assert.ok(html.indexOf('rosh-tl-stage') < html.indexOf('end-caption'));
});

test('nothing is cut: the idle year is drawn short, not notched, and the fortnight of revisions is readable', () => {
  const html = staticHtml(rail());
  assert.equal(count(html, 'data-timeline-part="break"'), 0, 'no break glyph');
  assert.doesNotMatch(html, /\d+ days<\/span>/, 'and no "N days" it would have said');
  // Every stretch between two revisions is at least the floor, so no two
  // revision dots overprint — which is what lets each carry its own caption.
  for (let i = 1; i < MOULD_AXIS.xs.length; i++) {
    assert.ok(MOULD_AXIS.xs[i] - MOULD_AXIS.xs[i - 1] >= 48 - 0.5, `stretch ${i} is ${MOULD_AXIS.xs[i] - MOULD_AXIS.xs[i - 1]}px`);
  }
  // And the idle ten months is still the longest stretch on the bar — drawn
  // short, because ten floors have to be paid for out of it, but never as
  // short as a week. (On a linear axis it owned 69% of the track and every
  // revision sat inside the first tenth.)
  const widths = MOULD_AXIS.gaps.map((gap) => gap.px);
  const idle = MOULD_AXIS.xByMs(day('2026-08-25')) - MOULD_AXIS.xByMs(day('2025-10-08'));
  assert.equal(idle, Math.max(...widths), 'the idle stretch is the longest');
  assert.ok(idle > 2 * 48, `and clearly longer than a floored week, got ${idle}px`);
  assert.equal(count(html, 'data-timeline-node="fold"'), 0, 'no dot had to fold into another');
});

test('a revision carries its caption over the dot, and the marks are placed off the spread axis', () => {
  const html = staticHtml(rail());
  const captions = captionsBlock(html);
  for (const v of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
    assert.match(captions, new RegExp(`>${v}</span>`), `caption ${v}`);
  }
  // A caption sits on its dot's coordinate, which is the spread axis's.
  const v5 = captions.match(/style="left:([0-9.]+)px[^"]*">v5</);
  assert.ok(v5, 'v5 is placed');
  assert.ok(Math.abs(Number(v5[1]) - MOULD_AXIS.xByMs(day('2025-07-30'))) < 0.5);
  // Milestones without a caption draw none: the stepper above names them.
  assert.doesNotMatch(captions, /Mould Complete|DFM Confirmed/);
});

test('captions that would overprint collapse to first–last', () => {
  // Three revisions on one day are one coordinate, so their captions are one
  // caption naming the run.
  const html = staticHtml(rail({
    milestones: [
      { key: 'init', label: 'Project Initiated', date: '2025-10-09' },
      { key: 'dfm1', label: 'DFM v1', date: '2025-11-07', kind: 'dfm', caption: 'v1' },
      { key: 'dfm2', label: 'DFM v2', date: '2025-11-07', kind: 'dfm', caption: 'v2' },
      { key: 'dfm3', label: 'DFM v3', date: '2025-11-07', kind: 'dfm', caption: 'v3' },
      { key: 'done', label: 'Mould Complete', date: '2025-12-03', kind: 'completion' },
    ],
    endDate: '2025-12-03',
  }));
  const captions = captionsBlock(html);
  assert.match(captions, />v1–v3</, `one caption for the run, in: ${captions}`);
  assert.doesNotMatch(captions, />v2</, 'and not three');
});

test('what has not happened is a dashed cap past a dashed tail, named in its own popover', () => {
  const html = staticHtml(rail());
  // The axis stops short of the layer by the tail.
  const railBar = html.match(/class="rosh-tl-rail[^"]*" style="[^"]*width:([0-9.]+)px/);
  assert.ok(railBar, 'the rail states its width');
  assert.equal(Number(railBar[1]), TRACK - CAP_TAIL);
  const tail = placed(html, 'tail');
  assert.equal(tail.left, TRACK - CAP_TAIL);
  assert.equal(tail.width, CAP_TAIL);
  // The cap is a real button at the layer's edge, announced as the last
  // pending milestone with the fact the rail no longer prints.
  const cap = html.match(/<button[^>]*data-timeline-node="cap"[^>]*>/);
  assert.ok(cap, `no cap in: ${html}`);
  assert.match(cap[0], /aria-label="Production Ready · Not yet reached"/);
  assert.match(cap[0], /class="[^"]*is-cap/);
  assert.match(cap[0], new RegExp(`left:${TRACK}px`));
});

test('the cap names every undated milestone, not only the one it is drawn as', () => {
  const html = staticHtml(rail({
    milestones: [...MOULD.slice(0, -1),
      { key: 'sample_shipped2', label: 'Sample Shipped', date: null, kind: 'shipment' },
      { key: 'production_ready', label: 'Production Ready', date: null, kind: 'completion' },
    ],
  }));
  const cap = html.match(/<button[^>]*data-timeline-node="cap"[^>]*>/);
  assert.ok(cap);
  assert.match(cap[0], /aria-label="Production Ready · Not yet reached · Also to come: Sample Shipped"/);
});

test('a programme with a finish date has no tail and no cap: the last milestone is the end of the rail', () => {
  const finished = MOULD.map((m) => (m.key === 'production_ready' ? { ...m, date: '2026-09-12' } : m));
  const html = staticHtml(rail({ milestones: finished, endDate: '2026-09-12' }));
  assert.doesNotMatch(html, /data-timeline-part="tail"/);
  assert.doesNotMatch(html, /data-timeline-node="cap"/);
  const railBar = html.match(/class="rosh-tl-rail[^"]*" style="[^"]*width:([0-9.]+)px/);
  assert.equal(Number(railBar![1]), TRACK, 'the axis has the whole layer');
  assert.match(html, /aria-label="Production Ready · 12\/09\/2026"[^>]*style="[^"]*left:600px/);
  assert.doesNotMatch(html, /data-timeline-part="today"/, 'and today is past the end, so it is not on the bar');
});

test('a provisional milestone is drawn hollow, is not "where we are", and the fill stops before it', () => {
  const html = staticHtml(rail());
  assert.match(nodeClasses(html, 'Sample ordered'), /is-provisional/);
  assert.doesNotMatch(nodeClasses(html, 'Sample ordered'), /is-current/, 'a promise is not where we are');
  assert.match(nodeClasses(html, 'DFM v6'), /is-current/, 'the last thing that happened is');
  assert.doesNotMatch(nodeClasses(html, 'Mould Complete'), /is-provisional/);
  const fill = html.match(/data-timeline-part="fill"[^>]*style="[^"]*width:([0-9.]+)px/);
  assert.ok(fill, 'there is a fill');
  // Up to DFM v6, the last thing that HAPPENED — not to the order date.
  assert.ok(Math.abs(Number(fill[1]) - MOULD_AXIS.xByMs(day('2026-08-25'))) < 0.5,
    `fill ${fill[1]}px should end at v6 (${MOULD_AXIS.xByMs(day('2026-08-25'))}px)`);
});

test('highlightKeys lights one band from the leftmost named mark to the rightmost, and every dot inside it', () => {
  const html = staticHtml(rail({ highlightKeys: ['dfm-1', 'dfm_confirmed'] }));
  const band = placed(html, 'highlight');
  const from = MOULD_AXIS.xByMs(day('2025-07-03'));
  const to = MOULD_AXIS.xByMs(day('2025-07-29'));
  assert.ok(Math.abs(band.left - (from - 10)) < 0.5, `band starts 10px before v1, got ${band.left}`);
  assert.ok(Math.abs(band.width - (to - from + 20)) < 0.5, `band runs to DFM Confirmed, got ${band.width}`);
  for (const inside of ['DFM v1', 'DFM v2', 'DFM v3', 'DFM v4', 'DFM Confirmed']) {
    assert.match(nodeClasses(html, inside), /is-lit/, `${inside} is lit`);
  }
  for (const outside of ['Project Initiated', 'DFM v5', 'Mould Complete']) {
    assert.doesNotMatch(nodeClasses(html, outside), /is-lit/, `${outside} is not`);
  }
});

test('one key is a ring around one dot; the cap answers to the pending key; nothing is lit for nothing', () => {
  const one = staticHtml(rail({ highlightKeys: ['sample_shipped'] }));
  const band = placed(one, 'highlight');
  assert.equal(band.width, 20, 'a band around a single mark');
  assert.match(nodeClasses(one, 'Sample ordered'), /is-lit/);

  const cap = staticHtml(rail({ highlightKeys: ['production_ready'] }));
  assert.match(cap.match(/<button[^>]*data-timeline-node="cap"[^>]*>/)![0], /is-lit/);

  const none = staticHtml(rail({ highlightKeys: ['no-such-milestone'] }));
  assert.doesNotMatch(none, /data-timeline-part="highlight"/);
  assert.doesNotMatch(none, /is-lit/);
});

test('onHoverChange names the milestone under the pointer, and null when it leaves', () => {
  const heard: (string | null)[] = [];
  const view = render(rail({ onHoverChange: (key) => heard.push(key) }));
  const dot = view.container.querySelector<HTMLElement>('[aria-label^="Mould Complete"]');
  assert.ok(dot);
  hover(dot);
  assert.deepEqual(heard, ['mould_complete']);
  unhover(dot);
  assert.deepEqual(heard, ['mould_complete', null]);
  // Focus is a pointer too: the stepper lights for a keyboard reader as well.
  act(() => { dot.focus(); });
  assert.equal(heard[heard.length - 1], 'mould_complete');
  act(() => { dot.blur(); });
  assert.equal(heard[heard.length - 1], null);
  // The cap reports the pending milestone it stands for.
  const cap = view.container.querySelector<HTMLElement>('[data-timeline-node="cap"]');
  assert.ok(cap);
  hover(cap);
  assert.equal(heard[heard.length - 1], 'production_ready');
  view.unmount();
});

test('the popover still opens on a bare rail — the dates went there, not away', () => {
  const view = render(rail());
  const dot = view.container.querySelector<HTMLElement>('[aria-label^="DFM Confirmed"]');
  assert.ok(dot);
  hover(dot);
  const tip = view.container.querySelector('[data-timeline-part="tooltip"]');
  assert.ok(tip, 'a popover opened');
  assert.match(tip.textContent ?? '', /DFM Confirmed/);
  assert.match(tip.textContent ?? '', /29\/07\/2025/);
  view.unmount();
});

test('the card variant is untouched by any of this', () => {
  const html = staticHtml(
    <MilestoneTimeline title="Mould development" milestones={MOULD} endDate={MOULD_END} />,
  );
  assert.match(html, /rosh-tl-card/);
  assert.ok(count(html, 'data-timeline-part="label"') > 0, 'labels in lanes');
  assert.match(html, /data-timeline-part="pending"/);
  assert.doesNotMatch(html, /data-timeline-part="captions"/);
  assert.doesNotMatch(html, /data-timeline-node="cap"/);
  assert.doesNotMatch(html, /rosh-tl-flank/);
});
