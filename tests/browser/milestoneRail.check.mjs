/**
 * The rail variant, in a browser that really lays it out.
 *
 * What jsdom cannot say: that six captions over six revision dots do not
 * overprint each other once the text has a width; that the highlight band a
 * hovered step asks for is drawn where the marks it names are; that hovering
 * a dot lights the step it belongs to, in real pointer events; and that the
 * finished shape has no tail, no cap and no "Today".
 *
 * Set TIMELINE_SHOTS_DIR to also save PNGs — in flight, finished, and dark.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const describe =
  'the bare rail: captions never overprint, a hovered step lights its stretch, a hovered dot lights its step';

export const viewport = { width: 1100, height: 520 };

async function boxes(page, selector) {
  const out = [];
  for (const node of await page.locator(selector).all()) {
    const box = await node.boundingBox();
    if (box) out.push({ box, text: await node.innerText().catch(() => '') });
  }
  return out;
}

function assertNoOverlap(entries, where) {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].box;
      const b = entries[j].box;
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width
        && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.ok(!overlaps, `${where}: "${entries[i].text}" and "${entries[j].text}" overprint (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
    }
  }
}

export default async function check(page, ctx) {
  const shots = process.env.TIMELINE_SHOTS_DIR;
  if (shots) mkdirSync(shots, { recursive: true });
  const shoot = async (name) => {
    if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
  };

  await ctx.open();
  await page.waitForSelector('[data-testid="rail"] [data-timeline-node="item"]');
  await page.waitForTimeout(700);

  // Captions, and the dots under them: no two of either overprint.
  const captions = await boxes(page, '[data-testid="rail"] .rosh-tl-caption');
  assert.equal(captions.length, 6, `six captions, got ${captions.map((c) => c.text).join(', ')}`);
  assertNoOverlap(captions, 'captions');
  const dots = await boxes(page, '[data-testid="rail"] .rosh-tl-nodes .rosh-tl-node');
  assert.equal(dots.length, 11, 'ten dated dots and the cap');
  assertNoOverlap(dots, 'dots');

  // No label lane, no pending column, no break glyph — and the flank captions
  // on either side of the rail, on the rail's row.
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="label"]').count(), 0);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="pending"]').count(), 0);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="break"]').count(), 0);
  const [start] = await boxes(page, '[data-testid="rail"] [data-timeline-part="start-caption"]');
  const [end] = await boxes(page, '[data-testid="rail"] [data-timeline-part="end-caption"]');
  const [rail] = await boxes(page, '[data-testid="rail"] .rosh-tl-rail');
  assert.ok(start && end && rail, 'the flank captions and the rail are laid out');
  assert.ok(start.box.x + start.box.width <= rail.box.x, '"Start" sits left of the rail');
  assert.ok(end.box.x >= rail.box.x + rail.box.width, '"Ready" sits right of the rail');
  assert.ok(Math.abs((start.box.y + start.box.height / 2) - (rail.box.y + rail.box.height / 2)) < 8, 'on the rail\'s row');
  await shoot('rail-light');

  // Stepper → rail: hovering a step draws the band over its stretch.
  await page.hover('[data-step="engineering"]');
  const band = page.locator('[data-testid="rail"] [data-timeline-part="highlight"]');
  await band.waitFor();
  const bandBox = await band.boundingBox();
  const v1 = await page.locator('[data-testid="rail"] [data-timeline-key="dfm-1"]').boundingBox();
  const confirmed = await page.locator('[data-testid="rail"] [data-timeline-key="dfm_confirmed"]').boundingBox();
  assert.ok(bandBox.x < v1.x && bandBox.x + bandBox.width > confirmed.x + confirmed.width,
    `the band covers v1 through DFM Confirmed: ${JSON.stringify(bandBox)}`);
  assert.equal(await page.locator('[data-testid="rail"] .rosh-tl-node.is-lit').count(), 5, 'v1–v4 and DFM Confirmed are lit');
  await shoot('rail-step-hover');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  assert.equal(await band.count(), 0, 'and it goes when the pointer leaves');

  // Rail → stepper: hovering a dot lights the step it belongs to.
  await page.hover('[data-testid="rail"] [data-timeline-key="mould_complete"]');
  await page.waitForSelector('[data-step="mould_production"][data-lit="true"]');
  await page.waitForSelector('[data-testid="rail"] [data-timeline-part="tooltip"]');
  await shoot('rail-dot-hover');
  await page.mouse.move(5, 5);
  await page.waitForSelector('[data-step="mould_production"][data-lit="false"]');

  // The cap lights the last step, and says what it stands for.
  await page.hover('[data-testid="rail"] [data-timeline-node="cap"]');
  await page.waitForSelector('[data-step="production_ready"][data-lit="true"]');
  const tip = await page.locator('[data-testid="rail"] [data-timeline-part="tooltip"]').innerText();
  assert.match(tip, /Production Ready/);
  assert.match(tip, /Not yet reached/);
  await page.mouse.move(5, 5);

  // Finished: the last milestone is the end of the rail.
  await ctx.open('?finished=1');
  await page.waitForSelector('[data-testid="rail"] [data-timeline-node="item"]');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-node="cap"]').count(), 0);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="tail"]').count(), 0);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="today"]').count(), 0);
  await shoot('rail-finished');

  await ctx.open('?theme=dark');
  await page.waitForSelector('[data-testid="rail"] [data-timeline-node="item"]');
  await page.waitForTimeout(700);
  await shoot('rail-dark');

  assert.deepEqual(ctx.pageErrors, [], 'the page threw nothing');
}
