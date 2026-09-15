/**
 * AppUpdateBanner — "a new version is available" for a tab that outlives a deploy.
 *
 * Long-lived tabs (every browser a team leaves open for the day) keep running
 * the bundle they loaded until someone reloads. Fixes land silently hours late,
 * people report bugs that are already fixed, and — since a deploy replaces the
 * lazy chunks the old bundle names — the first lazy window such a tab opens
 * crashes (see `staleChunk.ts` for that half). The banner is the other half:
 * it tells the user a deploy happened and offers the reload before a crash
 * has to.
 *
 * How it knows: `useAppUpdate` polls a small `version.json` the build emits
 * beside the bundle and compares it with the version the running bundle was
 * built as. No service worker, no workbox — a fetch a minute from a visible
 * tab, and one more the moment a hidden tab is shown again, since a tab that
 * sat in the background all afternoon is exactly the one that missed the
 * deploy. Polling stops once an update is known.
 *
 * Kit-safe: Banner, Button and the strings catalog, nothing else.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Banner from './Banner';
import Button from '../forms/Button';
import { useShellStrings } from './strings';

/** Default poll interval for a visible tab. */
export const APP_UPDATE_POLL_MS = 60_000;

export interface UseAppUpdateOptions {
  /**
   * The version THIS bundle was built as — the portal's `APP_VERSION`. An
   * empty string (a build with no version, a test) disables polling.
   */
  currentVersion: string;
  /** Where the deployed version is read from. Default `/version.json`. */
  versionUrl?: string;
  /** Poll interval while the tab is visible. Default {@link APP_UPDATE_POLL_MS}. */
  pollMs?: number;
}

/**
 * The deployed version once it differs from `currentVersion`, else `null`.
 *
 * Reads `{ version }` from `versionUrl` with the cache bypassed; a response
 * that is not JSON (the SPA fallback page, when the file is missing), not
 * `ok`, or unreachable is ignored and tried again next tick.
 */
export function useAppUpdate({
  currentVersion,
  versionUrl = '/version.json',
  pollMs = APP_UPDATE_POLL_MS,
}: UseAppUpdateOptions): string | null {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!currentVersion || latest !== null) return;
    let cancelled = false;

    const check = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const sep = versionUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${versionUrl}${sep}t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const version =
          data && typeof data === 'object' && typeof (data as { version?: unknown }).version === 'string'
            ? (data as { version: string }).version
            : null;
        if (!cancelled && version && version !== currentVersion) setLatest(version);
      } catch {
        /* offline, mid-deploy, or not JSON — next tick */
      }
    };

    void check();
    const timer = setInterval(() => { void check(); }, pollMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentVersion, versionUrl, pollMs, latest]);

  return latest;
}

export interface AppUpdateBannerProps extends UseAppUpdateOptions {
  /** Replaces the catalog's `update.available` line. */
  message?: ReactNode;
  /**
   * What "Refresh now" does. Default: `window.location.reload()`. A host that
   * wants to flush state first passes its own and ends with the reload.
   */
  onRefresh?: () => void;
  className?: string;
}

/**
 * Pinned at the top centre of the viewport, above every window, the moment
 * the deployed version differs from the one running. Renders nothing until
 * then. Mount it once, anywhere under the providers.
 */
export default function AppUpdateBanner({
  currentVersion,
  versionUrl,
  pollMs,
  message,
  onRefresh,
  className = '',
}: AppUpdateBannerProps) {
  const latest = useAppUpdate({ currentVersion, versionUrl, pollMs });
  const strings = useShellStrings();
  if (latest === null) return null;

  const refresh = onRefresh ?? (() => window.location.reload());
  return (
    <div
      data-app-update-banner=""
      className={`fixed left-1/2 top-3 z-[9999] w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 ${className}`.trim()}
    >
      <Banner
        tone="warning"
        className="shadow-lg"
        action={
          <Button type="button" variant="primary" size="md" onClick={refresh}>
            {strings.update.refreshNow}
          </Button>
        }
      >
        <span className="font-medium">{message ?? strings.update.available}</span>
        <span className="ml-2 whitespace-nowrap font-mono text-xs text-gray-500">
          {currentVersion} → {latest}
        </span>
      </Banner>
    </div>
  );
}
