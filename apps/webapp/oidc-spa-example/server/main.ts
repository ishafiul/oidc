import { serve } from '@hono/node-server';
import { config as loadDotenv } from 'dotenv';
import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { JWTPayload } from 'jose';
import { resolve } from 'node:path';
import { canReadDocument, grantRead, listGrantees } from './grants';
import {
  createJwksResolver,
  fetchDiscovery,
  fgacPermissionsFromPayload,
  fgacRelationsFromPayload,
  fgacTruncatedFromPayload,
  hasClientRole,
  hasRealmRole,
  realmAccessFromPayload,
  resourceAccessFromPayload,
  verifyAccessToken,
} from './oidc';

loadDotenv({ path: resolve(process.cwd(), '.env.development') });
loadDotenv({ path: resolve(process.cwd(), 'server/.env') });

const READ_SCOPE = 'demo:data:read';
const GRANT_SCOPE = 'demo:data:grant';
const DEMO_DOC_ID = 'quarterly-report';

const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, '') ?? '';
const projectSlug = process.env.OIDC_PROJECT_SLUG?.trim() ?? '';
const clientId = process.env.OIDC_CLIENT_ID?.trim() ?? '';
const port = Number(process.env.EXAMPLE_API_PORT ?? process.env.PORT ?? '8788');

if (!apiOrigin || !projectSlug || !clientId) {
  console.error('Set API_ORIGIN, OIDC_PROJECT_SLUG, OIDC_CLIENT_ID (see server/.env.example)');
  process.exit(1);
}

const discovery = await fetchDiscovery(apiOrigin, projectSlug);
const jwks = createJwksResolver(discovery.jwks_uri);

type AuthVars = {
  sub: string;
  scopes: Set<string>;
  payload: JWTPayload;
};

const app = new Hono<{ Variables: { auth: AuthVars } }>();

app.use(
  '/*',
  cors({
    origin: ['http://localhost:5175', 'http://127.0.0.1:5175'],
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

const requireAuth = createMiddleware<{ Variables: { auth: AuthVars } }>(async (c, next) => {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', message: 'Missing Bearer access token' }, 401);
  }
  const token = h.slice('Bearer '.length).trim();
  if (!token) {
    return c.json({ error: 'unauthorized', message: 'Empty Bearer token' }, 401);
  }
  try {
    const { sub, scopes, payload } = await verifyAccessToken({
      token,
      jwks,
      issuer: discovery.issuer,
      audience: clientId,
    });
    c.set('auth', { sub, scopes, payload });
    await next();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid token';
    return c.json({ error: 'unauthorized', message: msg }, 401);
  }
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    issuer: discovery.issuer,
    demoDocId: DEMO_DOC_ID,
    readScope: READ_SCOPE,
    grantScope: GRANT_SCOPE,
  }),
);

app.get('/api/me', requireAuth, (c) => {
  const { sub, scopes, payload } = c.get('auth');
  const scopeList = [...scopes].sort();
  const hasRead = scopes.has(READ_SCOPE);
  const hasGrant = scopes.has(GRANT_SCOPE);
  const grantedByShare = canReadDocument({
    docId: DEMO_DOC_ID,
    sub,
    scopes,
    readScope: READ_SCOPE,
  });
  const realm_access = realmAccessFromPayload(payload);
  const resource_access = resourceAccessFromPayload(payload);
  const fgac_permissions = fgacPermissionsFromPayload(payload);
  const fgac_relations = fgacRelationsFromPayload(payload);
  const fgac_truncated = fgacTruncatedFromPayload(payload);
  return c.json({
    sub,
    scopes: scopeList,
    realm_access,
    resource_access,
    fgac_permissions,
    fgac_relations,
    fgac_truncated,
    jwtAuthorizationExamples: {
      oauth_scope_read: scopes.has(READ_SCOPE),
      realm_role_owner: hasRealmRole(payload, 'owner'),
      client_scoped_role_owner: hasClientRole(payload, clientId, 'owner'),
    },
    oidcPermissionFlags: {
      [READ_SCOPE]: hasRead,
      [GRANT_SCOPE]: hasGrant,
    },
    effectiveDataAccess: {
      [DEMO_DOC_ID]: {
        canRead: grantedByShare,
        via: hasRead ? 'oidc_scope' : grantedByShare ? 'granted_by_user_with_grant_scope' : 'none',
      },
    },
    granteesOnDemoDoc: listGrantees(DEMO_DOC_ID),
    hint: `Add ${READ_SCOPE} and ${GRANT_SCOPE} to the client's scope set in oidc-admin if you want full demo.`,
  });
});

app.get('/api/data/:docId', requireAuth, (c) => {
  const docId = c.req.param('docId');
  const { sub, scopes } = c.get('auth');
  if (
    !canReadDocument({
      docId,
      sub,
      scopes,
      readScope: READ_SCOPE,
    })
  ) {
    return c.json(
      {
        error: 'forbidden',
        message: `Need ${READ_SCOPE} in the access token, or another user must grant you read on this document.`,
        docId,
      },
      403,
    );
  }
  return c.json({
    docId,
    title: 'Quarterly metrics (demo)',
    content: 'This row is visible because your token has demo:data:read or you were granted read on this document.',
    visibleToSub: sub,
  });
});

app.post('/api/data/:docId/grant', requireAuth, async (c) => {
  const docId = c.req.param('docId');
  const { sub, scopes } = c.get('auth');
  if (!scopes.has(GRANT_SCOPE)) {
    return c.json(
      {
        error: 'forbidden',
        message: `Need ${GRANT_SCOPE} in the access token to grant others read access.`,
      },
      403,
    );
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', message: 'JSON body required' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'bad_request', message: 'Expected object body' }, 400);
  }
  const granteeSub = (body as { granteeSub?: unknown }).granteeSub;
  if (typeof granteeSub !== 'string' || granteeSub.length === 0) {
    return c.json({ error: 'bad_request', message: 'granteeSub (string) required' }, 400);
  }
  grantRead(docId, granteeSub);
  return c.json({
    ok: true,
    docId,
    granteeSub,
    grantedBy: sub,
    grantees: listGrantees(docId),
  });
});

console.log(`OIDC example API listening on http://127.0.0.1:${port}`);
console.log(`Verifier issuer=${discovery.issuer} audience=${clientId}`);

serve({
  fetch: app.fetch,
  port,
});
