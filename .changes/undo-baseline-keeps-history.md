---
bump: minor
title: baseline() keeps the history unless a record lands; a mount-effect seed is not a step
---
- **`baseline()` keeps the history unless a record actually lands.** It used
  to discard the stack on every call, and a form's hydration effect reaches it
  on more edges than the load — most often the start of a background refetch,
  where a once-per-id guard skips re-seeding and nothing on screen moves. The
  app-wide polling and focus refetch made that a wipe every minute and on
  every return from a spreadsheet, so Undo/Redo went grey a moment after a
  bulk import with nothing saved (Purchase Invoice, then Goods Receipt and
  Goods Issue by the same shape). Now the history goes only when a slice takes
  a value while the baseline settles — a real seed, judged by content rather
  than identity, so a line grid re-seeded from a refetch as a fresh array of
  the same rows is the record coming round again and not a record landing —
  and `clear()`, the after-save call, is its own operation that always
  empties it.
- **`baseline(key)` names the record.** A form that hydrates per id passes it,
  and a switch to another record drops the history whether or not the new
  values happen to equal the old — the case where nothing records, and an undo
  would otherwise land on the wrong record. Pass it from the first load on (the
  first named call has nothing to compare with, so it never clears by itself),
  and pass `null` rather than `undefined` for a record with no id yet. A form
  that relies on a bare `baseline()` to clear the history on a switch must pass
  the key before it takes this version.
- **A default set and baselined in the same mount effect is no longer a
  step.** The lifting effect ran on mount and saw a suspension a child's effect
  had just begun in that same commit; lifting it there let the child's own seed
  record, so a new invoice opened with "Undo company" lit. The suspension now
  lifts only in the commit its token arrives in.
