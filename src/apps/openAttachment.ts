/**
 * Route a stored file into the app that can read it — Preview for PDFs,
 * images, drawings and 3D models, Spreadsheet for CSV/TSV — instead of handing
 * it to a browser tab (harness UI-18).
 *
 * Lifted from the admin portal, where it had routed email and CRM-note
 * attachments since 2026-09; the customer, supplier and dealer portals needed
 * the same decision table for their own attachments, and a fourth copy of a
 * classification this specific is exactly what drifts.
 *
 * Two transports, because stored-file URLs differ by deployment:
 *
 *   - By default the viewer is given the URL and fetches it itself. Fine where
 *     the file is same-origin with the page.
 *   - Pass `fetchBlob` where it is not. A presigned/CDN URL is cross-origin to
 *     the portal, so the viewer's own fetch fails ("Failed to fetch") even
 *     though the URL opens perfectly in a tab; the caller's API client pulls
 *     the bytes instead, and the window shows a placeholder until they land.
 *
 * Binary workbooks (xlsx, ods) stay downloads on purpose: previewing one means
 * parsing untrusted bytes in the host's own origin.
 */
import toast from '../shell/toast';
import { setPdfPreview } from './_previewStage';
import { setSpreadsheetPreview } from './_spreadsheetStage';

/** Minimal attachment shape — a filename and where the bytes are. */
export interface OpenableAttachment {
  filename?: string | null;
  /** `null` where the serializer could not address the stored file; treated
   *  exactly like a missing one, so a caller need not narrow before calling. */
  url?: string | null;
}

/** `useWindowManager().openPage`. */
export type OpenPage = (path: string) => void;

export interface OpenAttachmentOptions {
  /**
   * Fetch the bytes yourself — for a URL the page cannot fetch (presigned/CDN)
   * or one that needs an Authorization header. Called only for a file a viewer
   * can render; the window opens on `loadingMessage` and swaps in the result.
   * Reject with an Error whose message the reader should see.
   */
  fetchBlob?: (att: OpenableAttachment) => Promise<Blob>;
  /** Placeholder headline while `fetchBlob` runs. Default: "LOADING FILE". */
  loadingMessage?: string;
}

/** Lower-case file extension (no dot) from a name or URL, '' if none. */
function extOf(name: string): string {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec((name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

const DELIMITED_TEXT_EXT = new Set(['csv', 'tsv']);
const BINARY_WORKBOOK_EXT = new Set(['xlsx', 'xls', 'xlsm', 'ods']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const THREED_EXT = new Set(['step', 'stp', 'stl', 'obj', 'gltf', 'glb', '3mf', 'iges', 'igs']);

/** Which viewer renders this file, or `null` for one neither app can show. */
export function attachmentKind(nameOrUrl: string): 'pdf' | 'image' | '3d' | 'dxf' | 'csv' | null {
  const ext = extOf(nameOrUrl);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'dxf') return 'dxf';
  if (DELIMITED_TEXT_EXT.has(ext)) return 'csv';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (THREED_EXT.has(ext)) return '3d';
  return null;
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function readText(url: string, opts: OpenAttachmentOptions, att: OpenableAttachment): Promise<string> {
  if (opts.fetchBlob) return (await opts.fetchBlob(att)).text();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.text();
}

function errorText(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  return message || fallback;
}

/**
 * Open `att` in the shell app that can read it. `openPage` comes from
 * `useWindowManager()`.
 *
 * Resolves once the file has been handed to a window (or opened in a tab); it
 * never throws — a failure is shown to the reader, in the viewer when one is
 * already open for the file and as a toast when there is nothing to show it in.
 */
export async function openAttachment(
  att: OpenableAttachment,
  openPage: OpenPage,
  opts: OpenAttachmentOptions = {},
): Promise<void> {
  const url = att?.url || '';
  const filename = att?.filename || 'attachment';
  if (!url && !opts.fetchBlob) {
    toast.error('This attachment has no download link.');
    return;
  }
  const kind = attachmentKind(filename) ?? attachmentKind(url);

  if (kind === 'csv') {
    try {
      setSpreadsheetPreview({ csv: await readText(url, opts, att), filename });
      openPage('/spreadsheet');
    } catch {
      toast.error('Could not open the spreadsheet — opening the file instead.');
      if (url) openInNewTab(url);
    }
    return;
  }

  if (BINARY_WORKBOOK_EXT.has(extOf(filename) || extOf(url))) {
    // Parsing an untrusted workbook in the host's own origin is not worth a
    // preview; the reader gets the file itself.
    toast.error('Spreadsheet preview is unavailable for this file type. Opening the file instead.');
    if (url) openInNewTab(url);
    return;
  }

  if (!kind) {
    // No viewer renders docx / txt / zip — say so rather than appear to fail.
    if (!url) {
      toast.error('This attachment has no download link.');
      return;
    }
    toast.info('Opening this file outside the app — no viewer can show it here.');
    openInNewTab(url);
    return;
  }

  if (!opts.fetchBlob) {
    setPdfPreview({ url, filename, kind });
    openPage('/preview');
    return;
  }

  // The viewer cannot fetch this URL itself: open it on a placeholder and swap
  // the bytes in, so a slow file is visibly loading and a failed one says why
  // in the window the reader is already looking at.
  const handle = setPdfPreview({
    filename, kind, converting: true,
    convertingMessage: opts.loadingMessage || 'LOADING FILE',
  });
  openPage('/preview');
  try {
    const blob = await opts.fetchBlob(att);
    handle.update({ url: URL.createObjectURL(blob), filename, kind });
  } catch (err) {
    handle.update({
      filename, kind, converting: false,
      convertingMessage: errorText(err, 'Failed to load this file.'),
    });
  }
}
