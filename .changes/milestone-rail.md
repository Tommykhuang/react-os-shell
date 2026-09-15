---
bump: minor
title: MilestoneTimeline gains a bare rail variant that points at the stepper above it
---

- **`MilestoneTimeline` takes `variant="rail"`.** The bar alone, for a window
  whose stepper already names the stages: no card, no heading, no label under
  any dot. Every milestone is a dot with a popover (the label and date moved
  there, not away), a revision carries a two-character `caption` over its dot
  (`v3`; captions that would overprint collapse to `v1–v4`), the edge captions
  flank the rail on its own row (`edgeCaptions={{ start: 'Start', end:
  'Ready' }}`), and what has not happened is one dashed cap at the end of a
  dashed tail — a real button, announced as the last undated milestone and
  naming the rest in its popover — instead of a "Not yet reached" column.
  The card variant is unchanged.

  The rail's axis is the new **`spread`** mode on `TimelineTrack`: nothing is
  cut, so there is no break glyph and no "282 days" it would have said; every
  stretch between two dated marks is held to at least 48 px and the idle
  stretches pay for it in proportion. A ten-month wait is still the longest
  thing on the bar, just not 84% of it.

- **The stepper and the rail point at each other.** `highlightKeys` lights one
  soft band from the leftmost named milestone to the rightmost and every dot
  inside it (a single key is a ring around one dot; the cap answers to the
  pending milestone's key), and `onHoverChange` reports the milestone under
  the pointer or the focus, `null` on leave. A consumer hovering "Design for
  Manufacturing" above the bar can light DFM v1 through DFM Confirmed, and
  hovering DFM v3 on the bar can light the step.

- **A milestone can be `provisional`.** Placed on the best date the record
  holds for something that has not happened — a sample ORDERED on a day,
  drawn where the shipment will be — it is hollow, it is never "where we are",
  and the fill stops before it. The mould card used to draw a filled truck on
  the first sample order's date while the stepper above it said the sample
  had not shipped; now the two agree.
