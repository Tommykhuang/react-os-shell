---
bump: minor
title: ProductionTimeline gains the rail variant, invoices on the bar, and onPlayStart
---

- **`ProductionTimeline` takes `variant="rail"`.** The bar alone, for a
  window whose own header already says what the order is: no card, no
  heading, no lead-time line, no label under the active report — every
  report, shipment, inspection and invoice is a dot with a popover — the thumb
  with its date chip, `Start` and `Est. done` flanking the rail, the estimated
  completion as a hollow mark on the right edge while it is still ahead, and
  under the rail one row: Play, the return button when the thumb has been
  moved, and the `<report> · date · N% overall · N pc in stock` line. The rail
  keeps the 48 px floor between reports without cutting anything (the track's
  `spread` axis), so two reports a week apart on a twenty-month window are two
  dots rather than a `×2`. The card variant is unchanged.

- **`onPlayStart`** fires before the thumb moves, on a fresh run and on a
  resume, so a window that keeps the bar in view while its table shows
  something else can switch the table first — the customer order window flips
  from prices to production stages here, and Play is one press wherever the
  reader was.

- **Invoices on the bar.** `TimelineMarkerKind` (and `TimelineTrackKind`)
  gain `'invoice'`: an accent disc with a new `receipt` glyph, legended as
  "Invoice" on the card, beside the shipments and inspections. A
  `MilestoneTimeline` may use the kind too.

- **`TimelineTrack` takes `endMark`** — a hollow, dashed mark ON a bare
  rail's right edge for a day the window already runs to (an estimate, a
  contractual date), with the label and the date in its popover. The undated
  cap past the axis is unchanged.
