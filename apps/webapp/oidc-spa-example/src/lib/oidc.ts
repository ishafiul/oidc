export type OidcDiscovery = {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly userinfo_endpoint?: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function parseDiscoveryJson(data: unknown): OidcDiscovery {
  if (!data || typeof data !== 'object') {
    throw new Error('Discovery: expected JSON object');
  }
  const o = data as Record<string, unknown>;
  const issuer = o['issuer'];
  const authorization_endpoint = o['authorization_endpoint'];
  const token_endpoint = o['token_endpoint'];
  const userinfo_endpoint = o['userinfo_endpoint'];
  if (!isNonEmptyString(issuer) || !isNonEmptyString(authorization_endpoint) || !isNonEmptyString(token_endpoint)) {
    throw new Error('Discovery: missing issuer, authorization_endpoint, or token_endpoint');
  }
  return {
    issuer,
    authorization_endpoint,
    token_endpoint,
    userinfo_endpoint: isNonEmptyString(userinfo_endpoint) ? userinfo_endpoint : undefined,
  };
}

export async function fetchDiscovery(discoveryUrl: string): Promise<OidcDiscovery> {
  const res = await fetch(discoveryUrl);
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    throw new Error('Discovery: invalid JSON');
  }
  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'error_description' in parsed
        ? String((parsed as { error_description?: unknown }).error_description ?? res.statusText)
        : res.statusText;
    throw new Error(`Discovery failed (${res.status}): ${msg}`);
  }
  return parseDiscoveryJson(parsed);
}

export type TokenResponse = {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly id_token?: string;
  readonly refresh_token?: string;
  readonly scope?: string;
};

function parseTokenResponse(data: unknown): TokenResponse {
  if (!data || typeof data !== 'object') throw new Error('Token: expected JSON object');
  const o = data as Record<string, unknown>;
  const access_token = o['access_token'];
  const token_type = o['token_type'];
  const expires_in = o['expires_in'];
  if (!isNonEmptyString(access_token) || !isNonEmptyString(token_type) || typeof expires_in !== 'number') {
    throw new Error('Token: missing access_token, token_type, or expires_in');
  }
  return {
    access_token,
    token_type,
    expires_in,
    id_token: isNonEmptyString(o['id_token']) ? o['id_token'] : undefined,
    refresh_token: isNonEmptyString(o['refresh_token']) ? o['refresh_token'] : undefined,
    scope: isNonEmptyString(o['scope']) ? o['scope'] : undefined,
  };
}

export async function exchangeAuthorizationCode(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }

  const res = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    throw new Error('Token: invalid JSON');
  }

  if (!res.ok) {
    const desc =
      parsed && typeof parsed === 'object' && 'error_description' in parsed
        ? String((parsed as { error_description?: unknown }).error_description ?? '')
        : '';
    const err = parsed && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error: unknown }).error) : '';
    throw new Error(`Token exchange failed (${res.status})${err ? `: ${err}` : ''}${desc ? ` — ${desc}` : ''}`);
  }

  return parseTokenResponse(parsed);
}

export async function fetchUserInfo(userinfoUrl: string, accessToken: string): Promise<unknown> {
  const res = await fetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    throw new Error('UserInfo: invalid JSON');
  }
  if (!res.ok) {
    throw new Error(`UserInfo failed (${res.status})`);
  }
  return parsed;
}

export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  nonce?: string;
}): string {
  const u = new URL(params.authorizationEndpoint);
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', params.scope);
  u.searchParams.set('state', params.state);
  u.searchParams.set('code_challenge', params.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (params.nonce) {
    u.searchParams.set('nonce', params.nonce);
  }
  return u.toString();
}
