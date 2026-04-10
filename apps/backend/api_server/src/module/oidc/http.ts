import { Hono } from 'hono';
import type { Context } from 'hono';
import type { HonoTypes } from '../../core/context';
import { setBrowserCorsHeaders } from '../../core/browser-cors';
import { OidcError, OidcService } from './service';

function readBodyValue(body: Record<string, unknown>, key: string): string | undefined {
	const value = body[key];
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
}

function getService(c: Context<HonoTypes>) {
	return new OidcService(c.get('db'), c.env);
}

function resolveProjectSlug(c: Context<HonoTypes>, explicitSlug?: string): string {
	if (explicitSlug) {
		return explicitSlug;
	}
	return getService(c).resolveDefaultProjectSlug();
}

function handleOidcError(error: unknown, fallbackMessage: string, service: OidcService, context: string) {
	if (error instanceof OidcError) {
		return {
			status: error.status,
			body: error.toJson(),
		};
	}
	service.logUnexpectedError(error, context);
	return {
		status: 500,
		body: {
			error: 'server_error',
			error_description: fallbackMessage,
		},
	};
}

async function discoveryHandler(c: Context<HonoTypes>, explicitSlug?: string) {
	const service = getService(c);
	try {
		const slug = resolveProjectSlug(c, explicitSlug);
		const clientId = c.req.query('client_id');
		const payload = await service.getDiscoveryMetadataResponse(new URL(c.req.url).origin, slug, clientId);
		return c.json(payload);
	} catch (error) {
		const handled = handleOidcError(error, 'Failed to load discovery metadata', service, 'discovery');
		return c.json(handled.body, handled.status as 500 | 400 | 401);
	}
}

async function jwksHandler(c: Context<HonoTypes>, explicitSlug?: string) {
	const service = getService(c);
	try {
		const slug = resolveProjectSlug(c, explicitSlug);
		return c.json(await service.getJwks(slug));
	} catch (error) {
		const handled = handleOidcError(error, 'Failed to load JWKS', service, 'jwks');
		return c.json(handled.body, handled.status as 500 | 400 | 401);
	}
}

async function authorizeHandler(c: Context<HonoTypes>, explicitSlug?: string) {
	const service = getService(c);
	const query = c.req.query();
	const loginHint = query.login_hint ?? query.user_email;

	try {
		const slug = resolveProjectSlug(c, explicitSlug);
		const result = await service.authorize(slug, {
			clientId: query.client_id ?? '',
			redirectUri: query.redirect_uri ?? '',
			responseType: query.response_type ?? '',
			scope: query.scope ?? '',
			state: query.state,
			nonce: query.nonce,
			codeChallenge: query.code_challenge,
			codeChallengeMethod: query.code_challenge_method,
			loginHint,
			authorizeSession: query.authorize_session,
			authorizeRequestUrl: new URL(c.req.url).toString(),
		});
		return c.redirect(result.redirectTo, 302);
	} catch (error) {
		if (error instanceof OidcError) {
			const redirect = service.authorizeErrorRedirect(error);
			if (redirect) {
				return c.redirect(redirect, 302);
			}
			return c.json(error.toJson(), error.status);
		}

		service.logUnexpectedError(error, 'authorize');
		return c.json(
			{
				error: 'server_error',
				error_description: 'Authorization failed',
			},
			500,
		);
	}
}

async function tokenHandler(c: Context<HonoTypes>, explicitSlug?: string) {
	const service = getService(c);
	try {
		const slug = resolveProjectSlug(c, explicitSlug);
		const body = (await c.req.parseBody()) as Record<string, unknown>;
		const grantType = readBodyValue(body, 'grant_type');
		const basicAuth = c.req.header('authorization');
		const origin = new URL(c.req.url).origin;

		if (grantType === 'authorization_code') {
			const code = readBodyValue(body, 'code');
			const redirectUri = readBodyValue(body, 'redirect_uri');
			if (!code || !redirectUri) {
				throw new OidcError(400, 'invalid_request', 'code and redirect_uri are required');
			}

			const response = await service.exchangeAuthorizationCode(
				slug,
				{
					clientId: readBodyValue(body, 'client_id'),
					clientSecret: readBodyValue(body, 'client_secret'),
					code,
					redirectUri,
					codeVerifier: readBodyValue(body, 'code_verifier'),
					basicAuth,
				},
				origin,
			);
			return c.json(response);
		}

		if (grantType === 'refresh_token') {
			const refreshToken = readBodyValue(body, 'refresh_token');
			if (!refreshToken) {
				throw new OidcError(400, 'invalid_request', 'refresh_token is required');
			}

			const response = await service.exchangeRefreshToken(
				slug,
				{
					clientId: readBodyValue(body, 'client_id'),
					clientSecret: readBodyValue(body, 'client_secret'),
					refreshToken,
					basicAuth,
				},
				origin,
			);
			return c.json(response);
		}

		throw new OidcError(400, 'unsupported_grant_type', 'Unsupported grant_type');
	} catch (error) {
		if (error instanceof OidcError) {
			const status = error.status === 401 ? 401 : 400;
			return c.json(error.toJson(), status);
		}
		service.logUnexpectedError(error, 'token');
		return c.json(
			{
				error: 'server_error',
				error_description: 'Token exchange failed',
			},
			500,
		);
	}
}

async function userInfoHandler(c: Context<HonoTypes>, explicitSlug?: string) {
	const service = getService(c);
	const auth = c.req.header('authorization');
	if (!auth?.startsWith('Bearer ')) {
		return c.json(
			{
				error: 'invalid_token',
				error_description: 'Missing bearer token',
			},
			401,
		);
	}

	try {
		const slug = resolveProjectSlug(c, explicitSlug);
		const userInfo = await service.getUserInfo(slug, auth.slice(7));
		return c.json(userInfo);
	} catch (error) {
		if (error instanceof OidcError) {
			return c.json(error.toJson(), 401);
		}
		service.logUnexpectedError(error, 'userinfo');
		return c.json(
			{
				error: 'server_error',
				error_description: 'Failed to resolve userinfo',
			},
			500,
		);
	}
}

export const oidcHttpRoutes = new Hono<HonoTypes>();

oidcHttpRoutes.use('*', async (c, next) => {
	setBrowserCorsHeaders(c);
	if (c.req.method === 'OPTIONS') {
		return c.body(null, 204);
	}
	await next();
});

// Canonical project-scoped endpoints
oidcHttpRoutes.get('/projects/:projectSlug/.well-known/openid-configuration', async (c) =>
	discoveryHandler(c, c.req.param('projectSlug')),
);

oidcHttpRoutes.get('/projects/:projectSlug/oidc/jwks', async (c) =>
	jwksHandler(c, c.req.param('projectSlug')),
);

oidcHttpRoutes.get('/projects/:projectSlug/oidc/authorize', async (c) =>
	authorizeHandler(c, c.req.param('projectSlug')),
);

oidcHttpRoutes.post('/projects/:projectSlug/oidc/token', async (c) =>
	tokenHandler(c, c.req.param('projectSlug')),
);

oidcHttpRoutes.get('/projects/:projectSlug/oidc/userinfo', async (c) =>
	userInfoHandler(c, c.req.param('projectSlug')),
);

// Compatibility aliases via default project
oidcHttpRoutes.get('/.well-known/openid-configuration', async (c) => discoveryHandler(c));
oidcHttpRoutes.get('/oidc/jwks', async (c) => jwksHandler(c));
oidcHttpRoutes.get('/oidc/authorize', async (c) => authorizeHandler(c));
oidcHttpRoutes.post('/oidc/token', async (c) => tokenHandler(c));
oidcHttpRoutes.get('/oidc/userinfo', async (c) => userInfoHandler(c));
