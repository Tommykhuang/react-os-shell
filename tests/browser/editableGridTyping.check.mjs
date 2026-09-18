/**
 * Keys typed into an EditableGrid cell stay in the cell, in the order typed.
 *
 * Two defects put a production-progress figure typed as 100 on the record as
 * 001 (or 01, or 1):
 *
 *   * The first key opens the cell for editing and commits itself, and the
 *     caret then has to move past it before the next key lands. It used to
 *     move on the next animation frame, so a quick second key went in first.
 *   * The keys after the first stay in the DOM until the cell is left. React 19
 *     rewrites `dangerouslySetInnerHTML` whenever the prop OBJECT is new, and
 *     the grid built a new one on every render, so any re-render while a cell
 *     was being typed into wiped those keys and put the caret back at the start.
 *
 * The second exists only on React 19, and this lane bundles the package's own
 * React devDependency, which is 18 — steps 3 and 4 pass there with or without
 * the fix. Point the lane at a consumer's React to exercise them:
 *
 *   REACT_DIR=/path/to/app/node_modules npm run test:browser
 */
import assert from 'node:assert/strict';

export const describe = 'a grid cell keeps what is typed, in order, through re-renders';

const cellSelector = (row, col) => `[data-row="${row}"][data-col="${col}"]`;

export default async function check(page, { open }) {
  const react = await page.getByTestId('react-version').textContent();
  const on = what => `${what} (React ${react})`;
  const cell = (row, col) => page.locator(cellSelector(row, col));
  const leave = () => page.getByTestId('elsewhere').click();
  const ticks = async () => Number(await page.getByTestId('ticks').textContent());
  const reRendered = async () => {
    const from = await ticks();
    await page.waitForFunction(
      n => Number(document.querySelector('[data-testid="ticks"]')?.textContent) >= n + 2,
      from,
    );
  };

  // 1. The caret is past the first key before anything else can happen. Read
  //    once the microtasks React flushes a key's update in have run, with no
  //    animation frame in between — a frame is exactly what the old caret move
  //    waited for, and a fast typist's next key does not.
  const caret = await page.evaluate(async selector => {
    const el = document.querySelector(selector);
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const selection = window.getSelection();
    if (!selection?.rangeCount || !el.contains(selection.anchorNode)) return 'outside the cell';
    const end = document.createRange();
    end.selectNodeContents(el);
    end.collapse(false);
    const at = selection.getRangeAt(0);
    return at.collapsed && at.compareBoundaryPoints(Range.START_TO_START, end) === 0
      ? 'after the first key'
      : `at offset ${at.startOffset} of "${el.textContent}"`;
  }, cellSelector(0, 1));
  assert.equal(caret, 'after the first key', on('the caret moves past the first key at once'));
  await page.keyboard.type('00');
  await leave();
  assert.equal(await cell(0, 1).textContent(), '100', on('keys typed straight after the first'));

  // 2. At a typist's pace.
  await cell(1, 1).click();
  await page.keyboard.type('100', { delay: 150 });
  await leave();
  assert.equal(await cell(1, 1).textContent(), '100', on("keys typed at a typist's pace"));

  // 3. The page re-renders between the keys, and again before the cell is left.
  await page.getByTestId('ticking').click();
  await cell(2, 1).click();
  await page.keyboard.type('1');
  await reRendered();
  await page.keyboard.type('00');
  await reRendered();
  assert.equal(await cell(2, 1).textContent(), '100', on('typed keys survive a re-render'));
  await leave();
  assert.equal(await cell(2, 1).textContent(), '100', on('and are what the cell commits'));
  await page.getByTestId('ticking').click();

  // 4. BulkImportGrid grows its grid when typing reaches the last two rows —
  //    a re-render the grid causes itself. It opens with 15; this is row 14.
  await open('?mode=bulk');
  await cell(13, 1).click();
  await page.keyboard.type('100', { delay: 150 });
  await leave();
  assert.equal(await cell(13, 1).textContent(), '100', on('a bulk-import row that grows the grid'));
}
