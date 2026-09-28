/**
 * The first key typed into a dialog nested in a window stays typed.
 *
 * `dirty="auto"` listens for `input` in the capture phase, ahead of React's own
 * onChange. The first keystroke flips the dialog dirty, the dialog reports that
 * to its enclosing window, and the window re-renders the form. Done as a plain
 * setState, that render ran in the microtask after the capture listener — before
 * React had read the key — and put every controlled input back to its old
 * value. Later keys survived because the flag was already set.
 *
 * Browser-only: the microtask checkpoint between two listeners exists only for
 * an event the browser dispatches itself. jsdom and Testing Library dispatch
 * from script, where no checkpoint runs, so the jsdom suite passed throughout.
 */
import assert from 'node:assert/strict';

export const describe =
  'the first key typed into a nested dirty="auto" dialog is kept, and the dialog still reads dirty';

export default async function check(page, { pageErrors }) {
  await page.getByTestId('new').click();
  const input = page.getByTestId('reference');
  await input.click();

  await page.keyboard.type('4');
  assert.equal(await input.inputValue(), '4', 'the first key survives the dirty flip');
  await page.keyboard.type('1018');
  assert.equal(await input.inputValue(), '41018');

  // The flip still lands: closing the dialog asks before discarding.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await assert.doesNotReject(() => dialog.getByText('Discard changes?').waitFor());
  assert.deepEqual(pageErrors, []);
}
