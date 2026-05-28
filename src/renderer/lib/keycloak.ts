import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'https://auth.mindshub.ai/auth',
  realm: 'mindsdb',
  clientId: 'anton-desktop',
});

keycloak.onAuthError = () => {
  keycloak.clearToken();
  keycloak.login({ redirectUri: window.location.href });
};

export { keycloak };

export const getAccessToken = async (): Promise<string | null> => {
  if (!keycloak.authenticated) return null;
  try {
    await keycloak.updateToken(30);
    return keycloak.token ?? null;
  } catch {
    return keycloak.token ?? null;
  }
};

export function scheduleWebTokenRefresh(
  onNewToken: (token: string) => Promise<void>,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(): void {
    if (timer) clearTimeout(timer);
    const exp = keycloak.tokenParsed?.exp;
    if (!exp) return;
    const delay = Math.max(exp * 1000 - Date.now() - 60_000, 10_000);
    timer = setTimeout(async () => {
      try {
        const refreshed = await keycloak.updateToken(70);
        if (refreshed && keycloak.token) await onNewToken(keycloak.token);
        schedule();
      } catch {
        keycloak.clearToken();
        keycloak.login({ redirectUri: window.location.href });
      }
    }, delay);
  }

  schedule();
  return () => { if (timer) clearTimeout(timer); };
}
