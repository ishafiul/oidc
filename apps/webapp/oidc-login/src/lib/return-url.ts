export function getApiOriginFromEnv(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function normalizeApiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

export function parseAuthorizeReturnUrl(
  returnUrl: string,
  expectedApiOrigin: string,
): { ok: true; url: URL } | { ok: false } {
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    return { ok: false };
  }
  if (url.origin !== expectedApiOrigin) return { ok: false };
  if (!/\/oidc\/authorize\/?$/.test(url.pathname)) return { ok: false };
  return { ok: true, url };
}

export function appendOidcAuthorizeSession(
  authorizeUrl: URL,
  email: string,
  authorizeSession: string,
): string {
  const next = new URL(authorizeUrl.toString());
  next.searchParams.set('login_hint', email);
  next.searchParams.set('authorize_session', authorizeSession);
  return next.toString();
}
