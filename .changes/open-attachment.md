---
bump: minor
title: "openAttachment — route a stored file to the app that can read it"
---

- `react-os-shell/apps` gains **`openAttachment(att, openPage, opts?)`** and
  **`attachmentKind(nameOrUrl)`**: a file opens in Preview (PDF, image, DXF,
  3D) or Spreadsheet (CSV/TSV) instead of a browser tab. A binary workbook
  stays a download — parsing untrusted bytes in the host's origin is not worth
  a preview — and a type no viewer renders opens outside with a toast saying
  why, rather than appearing to fail.
- `opts.fetchBlob` is for a URL the page cannot fetch itself: a presigned or
  CDN URL is cross-origin to the host, so the viewer's own fetch fails even
  though the URL opens fine in a tab. The window then opens on a placeholder
  (`opts.loadingMessage`) and the bytes are swapped in when they land; a
  rejection ends as that Error's message in the same window.
- Lifted from the admin portal, which had carried this decision table since
  September; the other three portals need it for their attachments, and a
  fourth copy of a classification this specific is what drifts.
