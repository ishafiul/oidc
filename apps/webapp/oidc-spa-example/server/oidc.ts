import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type OidcDiscovery = {
  issuer: string;
  jwks_uri: string;
};

export async function fetchDiscovery(apiOrigin: string, projectSlug: string): Promise<OidcDiscovery> {
  const url = `${apiOrigin.replace(/\/$/, '')}/projects/${encodeURIComponent(projectSlug)}/.well-known/openid-configuration`;
  const res = await fetch(url);
  const raw = await res.text();
  let data: unknown;
  try {
    data = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    throw new Error('Discovery: invalid JSON');
  }
  if (!res.ok) {
    throw new Error(`Discovery failed (${res.status})`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Discovery: expected object');
  }
  const o = data as Record<string, unknown>;
  const issuer = o['issuer'];
  const jwks_uri = o['jwks_uri'];
  if (typeof issuer !== 'string' || typeof jwks_uri !== 'string') {
    throw new Error('Discovery: missing issuer or jwks_uri');
  }
  return { issuer, jwks_uri };
}

export function createJwksResolver(jwksUri: string) {
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  return jwks;
}

export function scopesFromPayload(payload: JWTPayload): Set<string> {
  const scope = payload['scope'];
  if (typeof scope !== 'string' || scope.length === 0) {
    return new Set();
  }
  return new Set(scope.split(/\s+/).filter(Boolean));
}

export type RealmAccessClaim = { roles: string[] };

export type ResourceAccessClaim = Record<string, { roles: string[] }>;

export function realmAccessFromPayload(payload: JWTPayload): RealmAccessClaim {
  const raw = payload['realm_access'];
  if (!raw || typeof raw !== 'object') {
    return { roles: [] };
  }
  const roles = (raw as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) {
    return { roles: [] };
  }
  return { roles: roles.filter((r): r is string => typeof r === 'string') };
}

export function resourceAccessFromPayload(payload: JWTPayload): ResourceAccessClaim {
  const raw = payload['resource_access'];
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out: ResourceAccessClaim = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const roles = (value as { roles?: unknown }).roles;
    if (!Array.isArray(roles)) {
      continue;
    }
    out[key] = { roles: roles.filter((r): r is string => typeof r === 'string') };
  }
  return out;
}

export type FgacRelationEntry = {
  resource_type: string;
  resource_id: string;
  relation: string;
};

export type FgacPermissionEntry = {
  resource_type: string;
  resource_id: string;
  permissions: string[];
};

export function fgacRelationsFromPayload(payload: JWTPayload): FgacRelationEntry[] {
  const raw = payload['fgac_relations'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: FgacRelationEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    const resource_type = o['resource_type'];
    const resource_id = o['resource_id'];
    const relation = o['relation'];
    if (
      typeof resource_type === 'string' &&
      typeof resource_id === 'string' &&
      typeof relation === 'string'
    ) {
      out.push({ resource_type, resource_id, relation });
    }
  }
  return out;
}

export function fgacTruncatedFromPayload(payload: JWTPayload): boolean {
  return payload['fgac_truncated'] === true;
}

export function fgacPermissionsFromPayload(payload: JWTPayload): FgacPermissionEntry[] {
  const raw = payload['fgac_permissions'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: FgacPermissionEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    const resource_type = o['resource_type'];
    const resource_id = o['resource_id'];
    const permissions = o['permissions'];
    if (
      typeof resource_type !== 'string' ||
      typeof resource_id !== 'string' ||
      !Array.isArray(permissions)
    ) {
      continue;
    }
    const normalized = permissions.filter((x): x is string => typeof x === 'string');
    out.push({
      resource_type,
      resource_id,
      permissions: Array.from(new Set(normalized)),
    });
  }
  return out;
}

export function matchesFgacGrant(
  relations: readonly FgacRelationEntry[],
  resourceType: string,
  resourceId: string,
  relation?: string,
): boolean {
  return relations.some((r) => {
    if (r.resource_type !== resourceType) {
      return false;
    }
    if (relation !== undefined && r.relation !== relation) {
      return false;
    }
    return r.resource_id === resourceId || r.resource_id === '*';
  });
}

export function hasFgacGrant(
  payload: JWTPayload,
  resourceType: string,
  resourceId: string,
  relation?: string,
): boolean {
  return matchesFgacGrant(fgacRelationsFromPayload(payload), resourceType, resourceId, relation);
}

export function hasRealmRole(payload: JWTPayload, role: string): boolean {
  return realmAccessFromPayload(payload).roles.includes(role);
}

export function hasClientRole(payload: JWTPayload, oauthClientId: string, role: string): boolean {
  const entry = resourceAccessFromPayload(payload)[oauthClientId];
  return entry?.roles.includes(role) ?? false;
}

export async function verifyAccessToken(params: {
  token: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  issuer: string;
  audience: string;
}): Promise<{ sub: string; scopes: Set<string>; payload: JWTPayload }> {
  const { payload } = await jwtVerify(params.token, params.jwks, {
    issuer: params.issuer,
    audience: params.audience,
  });
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new Error('Token missing sub');
  }
  return { sub, scopes: scopesFromPayload(payload), payload };
}
