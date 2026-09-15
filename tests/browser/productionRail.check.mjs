/**
 * The production rail, in a browser that really lays it out.
 *
 * What jsdom cannot say: that seven report dots, two shipments, two invoices
 * and an inspection on a twenty-month window never overprint once the marks
 * have a size; that Play on the row under the rail tells the consumer first
 * (the page flips its Items view) and then moves the thumb; that the estimate
 * ahead is drawn on the right edge with its own caption.
 *
 * Set TIMELINE_SHOTS_DIR to also save PNGs — light, playing, dark.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const describe =
  'the production rail: marks never overprint, Play flips the consumer view before the thumb moves, the estimate caps the edge';

export const viewport = { width: 1000, height: 420 };

async function boxes(page, selector) {
  const out = [];
  for (const node of await page.locator(selector).all()) {
    const box = await node.boundingBox();
    if (box) out.push({ box, text: (await node.getAttribute('aria-label')) ?? (await node.innerText().catch(() => '')) });
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

  // Every mark is its own mark — the spread axis holds the three January
  // reports and the four documents around them apart, and none folds.
  const nodes = await boxes(page, '[data-testid="rail"] .rosh-tl-nodes .rosh-tl-node');
  assert.equal(nodes.length, 7 + 5 + 1, `7 reports + 5 documents + the estimate, got ${nodes.length}`);
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-node="fold"]').count(), 0, 'nothing folded');
  assertNoOverlap(nodes.filter((n) => !/^Estimated/.test(n.text)), 'marks');
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="label"]').count(), 0, 'no label lane');
  assert.equal(await page.locator('[data-testid="rail"] .rosh-tl-card').count(), 0, 'no card');

  // The estimate caps the right edge, with its caption beside the rail.
  const cap = page.locator('[data-testid="rail"] [data-timeline-node="cap"]');
  assert.equal(await cap.count(), 1);
  assert.match(await cap.getAttribute('aria-label'), /^Estimated completion · /);
  const [rail] = await boxes(page, '[data-testid="rail"] .rosh-tl-rail');
  const capBox = await cap.boundingBox();
  assert.ok(Math.abs((capBox.x + capBox.width / 2) - (rail.box.x + rail.box.width)) < 2, 'the estimate sits on the rail\'s right end');
  assert.equal(await page.locator('[data-testid="rail"] [data-timeline-part="end-caption"]').innerText(), 'Est. done');

  // The row under the rail: Play, then the status line, opening with the
  // report's name and not with "Showing".
  const row = page.locator('[data-testid="rail"] [data-timeline-part="rail-row"]');
  const rowBox = await row.boundingBox();
  assert.ok(rowBox.y > rail.box.y, 'the row is under the rail');
  const play = row.locator('.rosh-tl-play');
  assert.equal(await play.count(), 1);
  assert.match(await row.locator('.rosh-tl-status').innerText(), /^Production report · /);
  await shoot('production-rail-light');

  // Play tells the consumer first: the page's Items view flips to production
  // before the thumb has moved.
  assert.equal(await page.locator('[data-testid="view"]').getAttribute('data-view'), 'order');
  const thumbBefore = await page.locator('[data-testid="rail"] [data-timeline-part="thumb"]').boundingBox();
  await play.click();
  assert.equal(await page.locator('[data-testid="view"]').getAttribute('data-view'), 'production');
  await page.waitForTimeout(900);
  const thumbAfter = await page.locator('[data-testid="rail"] [data-timeline-part="thumb"]').boundingBox();
  assert.notEqual(thumbAfter.x, thumbBefore.x, 'the thumb set off');
  assert.equal(await play.innerText(), 'Pause');
  await shoot('production-rail-playing');
  await play.click();

  await ctx.open('?theme=dark');
  await page.waitForSelector('[data-testid="rail"] [data-timeline-node="item"]');
  await page.waitForTimeout(700);
  await shoot('production-rail-dark');

  assert.deepEqual(ctx.pageErrors, [], 'the page threw nothing');
}
