import { saveTokens, getRefreshToken, clearTokens } from './token-store';
import { stopServer, startServer } from './server-process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const TOKEN_URL =
  'https://auth.mindshub.ai/auth/realms/mindsdb/protocol/openid-connect/token';

export async function silentRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'anton-desktop',
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) return false;
    const data = await res.json() as { access_token: string; expires_in?: number; refresh_token?: string };
    saveTokens(data.access_token, data.expires_in ?? 3600, data.refresh_token ?? refreshToken);
    await writeTokenToEnvAndRestartServer(data.access_token);
    scheduleRefresh(data.expires_in ?? 3600);
    return true;
  } catch {
    return false;
  }
}

const MINDS_KEYS = ['ANTON_OPENAI_API_KEY', 'ANTON_MINDS_API_KEY', 'ANTON_OPENAI_BASE_URL'];

// Writes the three MindsHub token keys to ~/.anton/.env (merge, not overwrite)
// then restarts the Python server so it picks up the fresh JWT.
// ANTON_OPENAI_BASE_URL is required because checkConfigured() demands it alongside
// ANTON_OPENAI_API_KEY — omitting it causes an infinite onboarding loop.
export async function writeTokenToEnvAndRestartServer(accessToken: string): Promise<void> {
  const envPath = path.join(os.homedir(), '.anton', '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const lines = existing.split('\n')
    .filter(l => !MINDS_KEYS.some(k => l.startsWith(k + '=')));
  lines.push(
    `ANTON_OPENAI_API_KEY=${accessToken}`,
    `ANTON_MINDS_API_KEY=${accessToken}`,
    `ANTON_OPENAI_BASE_URL=https://api.mindshub.ai/v1`,
  );
  fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf-8');
  await stopServer();
  await startServer();
}

let _refreshTimer: NodeJS.Timeout | null = null;

export function scheduleRefresh(expiresInSeconds: number): void {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const delay = Math.max((expiresInSeconds - 60) * 1000, 10_000);
  _refreshTimer = setTimeout(silentRefresh, delay);
}
