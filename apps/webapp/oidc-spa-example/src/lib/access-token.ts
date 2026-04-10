import { sessionKeys } from '@/lib/session';

export function getStoredAccessToken(): string | null {
  const raw = sessionStorage.getItem(sessionKeys.tokenJson);
  if (!raw) {
    return null;
  }
  try {
    const t = JSON.parse(raw) as { access_token?: unknown };
    return typeof t.access_token === 'string' ? t.access_token : null;
  } catch {
    return null;
  }
}

export async function exampleApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredAccessToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`/example-api${path}`, { ...init, headers });
}
