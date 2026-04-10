function trimOrigin(raw: string): string {
  return raw.replace(/\/$/, '');
}

export function getOidcConfig(): {
  apiOrigin: string;
  projectSlug: string;
  clientId: string;
  redirectUri: string;
  scope: string;
} {
  const apiOrigin = trimOrigin(import.meta.env.VITE_API_ORIGIN ?? '');
  const projectSlug = import.meta.env.VITE_OIDC_PROJECT_SLUG?.trim() ?? '';
  const clientId = import.meta.env.VITE_OIDC_CLIENT_ID?.trim() ?? '';
  const redirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI?.trim() ?? '';
  const scope = import.meta.env.VITE_OIDC_SCOPE?.trim() ?? 'openid email profile';
  return { apiOrigin, projectSlug, clientId, redirectUri, scope };
}

export function discoveryUrl(apiOrigin: string, projectSlug: string): string {
  return `${trimOrigin(apiOrigin)}/projects/${encodeURIComponent(projectSlug)}/.well-known/openid-configuration`;
}
