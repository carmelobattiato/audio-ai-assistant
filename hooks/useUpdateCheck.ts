import { useEffect } from 'react';
import { APP_VERSION } from '../constants';

export interface UpdateInfo {
  localVersion: string;
  remoteVersion: string;
  hasUpdate: boolean;
  repoUrl: string;
}

const LS_LAST_CHECK   = 'update-last-check';
const LS_DISMISSED    = 'update-dismissed-version';
const WEEK_MS  = 7  * 24 * 60 * 60_000;
const MONTH_MS = 30 * 24 * 60 * 60_000;

function parseVersion(raw: string): number[] {
  return raw.split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(remote: number[], local: number[]): boolean {
  for (let i = 0; i < Math.max(remote.length, local.length); i++) {
    const r = remote[i] ?? 0;
    const l = local[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function fetchRemoteVersion(repoUrl: string): Promise<string | null> {
  try {
    // Derive raw URL from github.com/owner/repo
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match?.[1]) return null;
    const slug = match[1].replace(/\.git$/, '');
    const rawUrl = `https://raw.githubusercontent.com/${slug}/main/constants/appConfig.ts`;
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function useUpdateCheck(
  repoUrl: string,
  frequency: 'weekly' | 'monthly' | 'never' | undefined,
  onUpdateFound: (info: UpdateInfo) => void,
): void {
  useEffect(() => {
    if (!frequency || frequency === 'never' || !repoUrl) return;

    const intervalMs = frequency === 'monthly' ? MONTH_MS : WEEK_MS;
    const lastCheckRaw = localStorage.getItem(LS_LAST_CHECK);
    const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;
    if (Date.now() - lastCheck < intervalMs) return;

    (async () => {
      const remoteVersion = await fetchRemoteVersion(repoUrl);
      localStorage.setItem(LS_LAST_CHECK, String(Date.now()));
      if (!remoteVersion) return;

      const dismissed = localStorage.getItem(LS_DISMISSED);
      if (dismissed === remoteVersion) return;

      const remote = parseVersion(remoteVersion);
      const local  = parseVersion(APP_VERSION);
      if (!isNewer(remote, local)) return;

      onUpdateFound({
        localVersion: APP_VERSION,
        remoteVersion,
        hasUpdate: true,
        repoUrl,
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
