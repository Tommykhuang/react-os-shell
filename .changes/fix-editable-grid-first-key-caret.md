---
bump: patch
title: EditableGrid keeps what is typed into a cell, in order, on React 19
---

- **A grid cell no longer loses or reorders what is typed into it.** On a
  React 19 host, typing `100` into an `EditableGrid` cell could be committed
  as `001`, `01` or `1`. The supplier portal's production-progress form did
  it at an ordinary typing pace. There were two causes:

  - The keys after the first stay in the cell's DOM until the cell is left.
    React 19 rewrites `dangerouslySetInnerHTML` whenever the prop object is
    new (React 18 compared the `__html` string), and the grid built a new
    object on every render. Any re-render while a cell was being typed into
    wiped those keys and put the caret back at the start. Two things cause
    such a re-render: a host form running a debounced check on the figures,
    and `BulkImportGrid` adding rows once typing reaches its last two. The
    object is now kept for as long as the cell's value stays the same, which
    is what React 18 already checked.
  - The first key opens the cell and commits itself, and the caret then has
    to move past it. It used to move on the next animation frame, so a quick
    second key could land in front of the first, and in a hidden tab the
    caret never moved. It now moves in the same commit.

  Spreadsheets 1.1.3 carries the fix. `npm run test:browser` also takes
  `REACT_DIR` (a directory holding `react` and `react-dom`) to run the lane
  on a consumer's React.
