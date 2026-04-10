import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { logger } from 'common-pack/logger';
import type { DB } from '../../core/db';
import {
	oidcAuthorizationCodes,
	oidcAuthorizeSessions,
	oidcClientRedirectUris,
	oidcClients,
	oidcClientScopeSets,
	oidcRefreshTokens,
	oidcScopeSetScopes,
	oidcScopeSets,
	oidcSigningKeys,
	projects,
} from '../../core/db/schema';
import type { Env } from '../../core/context';
import { createPermissionManagementService, type PermissionServiceEnv } from '../fgac/services/permission-service.factory';
import {
	buildProjectFgacConfig,
	listMergedFgacDocTypes,
} from '../permissions/project-fgac';
import { findUserById } from '../auth/repositories';
import { normalizeRedirectUri } from './redirect-uri';

const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const;

const PROJECT_MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;

const FGAC_RELATIONS_MAX_IN_JWT = 100;

function isProjectMemberRole(value: string): value is (typeof PROJECT_MEMBER_ROLES)[number] {
	return (PROJECT_MEMBER_ROLES as readonly string[]).includes(value);
}

function oauthAudienceClientId(aud: unknown): string | null {
	if (typeof aud === 'string' && aud.length > 0) {
		return aud;
	}
	if (Array.isArray(aud) && aud.length > 0 && typeof aud[0] === 'string' && aud[0].length > 0) {
		return aud[0];
	}
	return null;
}
const DEFAULT_CODE_TTL_SECONDS = 300;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

type AuthorizeInput = {
	clientId: string;
	redirectUri: string;
	responseType: string;
	scope: string;
	state?: string;
	nonce?: string;
	codeChallenge?: string;
	codeChallengeMethod?: string;
	loginHint?: string;
	authorizeSession?: string;
	authorizeRequestUrl?: string;
};

type TokenExchangeCodeInput = {
	clientId?: string;
	clientSecret?: string;
	code: string;
	redirectUri: string;
	codeVerifier?: string;
	basicAuth?: string;
};

type TokenExchangeRefreshInput = {
	clientId?: string;
	clientSecret?: string;
	refreshToken: string;
	basicAuth?: string;
};

type TokenResponse = {
	token_type: 'Bearer';
	access_token: string;
	id_token: string;
	refresh_token: string;
	expires_in: number;
	scope: string;
};

type OidcJwk = JsonWebKey & {
	kid?: string;
	alg?: string;
	use?: string;
};

type JwtPayload = Record<string, unknown> & {
	sub?: string;
	exp?: number;
	token_use?: string;
};

type ProjectModel = typeof projects.$inferSelect;
type ClientRow = typeof oidcClients.$inferSelect;

type OidcJsonError = {
	error: string;
	error_description: string;
};

type OidcErrorStatus = 400 | 401 | 500;

export class OidcError extends Error {
	constructor(
		public readonly status: OidcErrorStatus,
		public readonly error: string,
		public readonly description: string,
		public readonly redirectUri?: string,
		public readonly state?: string,
	) {
		super(description);
	}

	toJson(): OidcJsonError {
		return {
			error: this.error,
			error_description: this.description,
		};
	}
}

function nowEpochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function base64UrlEncode(input: string | Uint8Array): string {
	const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	const decoded = atob(padded);
	const bytes = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; i += 1) {
		bytes[i] = decoded.charCodeAt(i);
	}
	return bytes;
}

function parseScope(scope: string): string[] {
	return Array.from(new Set(scope.trim().split(/\s+/).filter(Boolean)));
}

function parseOptionalPositiveInt(input: string | undefined, fallback: number): number {
	if (!input) return fallback;
	const value = Number.parseInt(input, 10);
	if (!Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return value;
}

function encodeAuthorizeRedirect(
	redirectUri: string,
	params: Record<string, string | undefined>,
): string {
	const url = new URL(redirectUri);
	for (const [key, value] of Object.entries(params)) {
		if (value) {
			url.searchParams.set(key, value);
		}
	}
	return url.toString();
}

function isNonHttpAppRedirectUri(redirectUri: string): boolean {
	const t = redirectUri.trim().toLowerCase();
	return !t.startsWith('http://') && !t.startsWith('https://');
}

function authorizeRedirectViaHostedBridge(
	hostedLoginBase: string,
	redirectUri: string,
	params: Record<string, string | undefined>,
): string {
	const base = hostedLoginBase.trim().replace(/\/+$/, '');
	const u = new URL(`${base}/oauth-app-redirect`);
	u.searchParams.set('redirect_uri', redirectUri);
	for (const [key, value] of Object.entries(params)) {
		if (value) {
			u.searchParams.set(key, value);
		}
	}
	return u.toString();
}

function buildClientRedirectUrl(
	env: Env,
	redirectUri: string,
	params: Record<string, string | undefined>,
): string {
	const hosted = env.OIDC_HOSTED_LOGIN_URL?.trim();
	if (hosted && isNonHttpAppRedirectUri(redirectUri)) {
		return authorizeRedirectViaHostedBridge(hosted, redirectUri, params);
	}
	return encodeAuthorizeRedirect(redirectUri, params);
}

function parseJsonWebKey(serialized: string, context: string): OidcJwk {
	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized) as unknown;
	} catch {
		throw new OidcError(500, 'server_error', `Invalid ${context} JWK JSON`);
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new OidcError(500, 'server_error', `Invalid ${context} JWK payload`);
	}
	return parsed as OidcJwk;
}

export class OidcService {
	constructor(
		private readonly db: DB,
		private readonly env: Env,
	) {}

	private issuer(origin: string, projectSlug: string): string {
		const base = this.env.OIDC_ISSUER?.trim() || origin;
		return `${base.replace(/\/+$/, '')}/projects/${projectSlug}`;
	}

	private codeTtlSeconds(): number {
		return parseOptionalPositiveInt(this.env.OIDC_CODE_TTL_SECONDS, DEFAULT_CODE_TTL_SECONDS);
	}

	private accessTokenTtlSeconds(): number {
		return parseOptionalPositiveInt(this.env.OIDC_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
	}

	private refreshTokenTtlSeconds(): number {
		return parseOptionalPositiveInt(this.env.OIDC_REFRESH_TOKEN_TTL_SECONDS, DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
	}

	private async sha256(value: string): Promise<Uint8Array> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return new Uint8Array(digest);
	}

	private async sha256Hex(value: string): Promise<string> {
		const bytes = await this.sha256(value);
		return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	private async sha256Base64Url(value: string): Promise<string> {
		return base64UrlEncode(await this.sha256(value));
	}

	private randomToken(byteLength = 32): string {
		const bytes = new Uint8Array(byteLength);
		crypto.getRandomValues(bytes);
		return base64UrlEncode(bytes);
	}

	private async getProjectBySlug(slug: string): Promise<ProjectModel> {
		const project = await this.db.query.projects.findFirst({
			where: (table, { and, eq }) => and(eq(table.slug, slug), eq(table.isActive, true)),
		});
		if (!project) {
			throw new OidcError(400, 'invalid_request', 'Unknown project');
		}
		return project;
	}

	private async getClient(projectId: string, clientId: string): Promise<ClientRow> {
		const client = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, projectId), eq(table.clientId, clientId), eq(table.isActive, true)),
		});
		if (!client) {
			throw new OidcError(401, 'invalid_client', 'Unknown client');
		}
		return client;
	}

	private async resolveAllowedScopes(projectId: string, clientRecordId: string): Promise<string[]> {
		const mappings = await this.db.query.oidcClientScopeSets.findMany({
			where: (table, { eq }) => eq(table.clientId, clientRecordId),
		});

		if (mappings.length === 0) {
			return [...DEFAULT_SCOPES];
		}

		const scopes = new Set<string>();

		for (const mapping of mappings) {
			const scopeSet = await this.db.query.oidcScopeSets.findFirst({
				where: (table, { and, eq }) =>
					and(eq(table.id, mapping.scopeSetId), eq(table.projectId, projectId), eq(table.isActive, true)),
			});
			if (!scopeSet) {
				continue;
			}

			const scopeRows = await this.db.query.oidcScopeSetScopes.findMany({
				where: (table, { eq }) => eq(table.scopeSetId, scopeSet.id),
			});
			scopeRows.forEach((row) => scopes.add(row.scope));
		}

		return scopes.size > 0 ? Array.from(scopes) : [...DEFAULT_SCOPES];
	}

	private async getRedirectUris(clientRecordId: string): Promise<string[]> {
		const rows = await this.db.query.oidcClientRedirectUris.findMany({
			where: (table, { eq }) => eq(table.clientId, clientRecordId),
		});
		return rows.map((row) => row.redirectUri);
	}

	private redirectUriIsRegistered(registered: string[], candidate: string): boolean {
		const n = normalizeRedirectUri(candidate);
		return registered.some((r) => normalizeRedirectUri(r) === n);
	}

	private async authenticateClient(
		projectId: string,
		input: {
			clientId?: string;
			clientSecret?: string;
			basicAuth?: string;
		},
	): Promise<ClientRow> {
		let clientId = input.clientId;
		let clientSecret = input.clientSecret;

		if (input.basicAuth?.startsWith('Basic ')) {
			try {
				const credentials = atob(input.basicAuth.slice(6));
				const [id, secret] = credentials.split(':');
				if (id && !clientId) clientId = id;
				if (secret && !clientSecret) clientSecret = secret;
			} catch {
				throw new OidcError(401, 'invalid_client', 'Invalid client credentials encoding');
			}
		}

		if (!clientId) {
			throw new OidcError(401, 'invalid_client', 'Missing client_id');
		}

		const client = await this.getClient(projectId, clientId);
		if (!client.isPublic) {
			if (!client.clientSecret || clientSecret !== client.clientSecret) {
				throw new OidcError(401, 'invalid_client', 'Invalid client secret');
			}
		}

		return client;
	}

	async createAuthorizeSession(userId: string): Promise<{ authorize_session: string; expires_in: number }> {
		const plain = this.randomToken(32);
		const tokenHash = await this.sha256Hex(plain);
		const ttl = this.codeTtlSeconds();
		await this.db.insert(oidcAuthorizeSessions).values({
			id: crypto.randomUUID(),
			tokenHash,
			userId,
			expiresAt: new Date(Date.now() + ttl * 1000),
			consumedAt: null,
		});
		return { authorize_session: plain, expires_in: ttl };
	}

	private async ensureActiveSigningKey(projectId: string): Promise<typeof oidcSigningKeys.$inferSelect> {
		const existing = await this.db.query.oidcSigningKeys.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, projectId), eq(table.isActive, true)),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});

		if (existing) {
			return existing;
		}

		const keyPair = await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]).buffer,
				hash: 'SHA-256',
			},
			true,
			['sign', 'verify'],
		);

		if (!('publicKey' in keyPair) || !('privateKey' in keyPair)) {
			throw new OidcError(500, 'server_error', 'Invalid signing key pair');
		}

		const kid = crypto.randomUUID();
		const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as OidcJwk;
		const privateJwk = (await crypto.subtle.exportKey('jwk', keyPair.privateKey)) as OidcJwk;

		const [inserted] = await this.db
			.insert(oidcSigningKeys)
			.values({
				id: crypto.randomUUID(),
				projectId,
				kid,
				algorithm: 'RS256',
				publicJwk: JSON.stringify({
					...publicJwk,
					kid,
					alg: 'RS256',
					use: 'sig',
				}),
				privateJwk: JSON.stringify({
					...privateJwk,
					kid,
					alg: 'RS256',
					use: 'sig',
				}),
				isActive: true,
			})
			.returning();

		if (!inserted) {
			throw new OidcError(500, 'server_error', 'Failed to create signing key');
		}

		return inserted;
	}

	private async signJwt(
		header: Record<string, unknown>,
		payload: Record<string, unknown>,
		privateJwk: OidcJwk,
	): Promise<string> {
		const encodedHeader = base64UrlEncode(JSON.stringify(header));
		const encodedPayload = base64UrlEncode(JSON.stringify(payload));
		const unsignedToken = `${encodedHeader}.${encodedPayload}`;

		const privateKey = await crypto.subtle.importKey(
			'jwk',
			privateJwk,
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			false,
			['sign'],
		);

		const signature = await crypto.subtle.sign(
			'RSASSA-PKCS1-v1_5',
			privateKey,
			new TextEncoder().encode(unsignedToken),
		);

		return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
	}

	private async verifyJwt(projectId: string, token: string): Promise<JwtPayload> {
		const parts = token.split('.');
		if (parts.length !== 3) {
			throw new OidcError(401, 'invalid_token', 'Malformed token');
		}

		let header: { alg?: string; kid?: string };
		let payload: JwtPayload;

		try {
			header = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(parts[0])));
			payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(parts[1])));
		} catch {
			throw new OidcError(401, 'invalid_token', 'Invalid token encoding');
		}

		if (header.alg !== 'RS256' || !header.kid) {
			throw new OidcError(401, 'invalid_token', 'Unsupported token algorithm');
		}
		const kid = header.kid;

		const keyRow = await this.db.query.oidcSigningKeys.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, projectId), eq(table.kid, kid), eq(table.isActive, true)),
		});
		if (!keyRow) {
			throw new OidcError(401, 'invalid_token', 'Unknown signing key');
		}

		const publicJwk = parseJsonWebKey(keyRow.publicJwk, 'public');
		const publicKey = await crypto.subtle.importKey(
			'jwk',
			publicJwk,
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			false,
			['verify'],
		);

		const verified = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64UrlDecodeToBytes(parts[2]),
			new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
		);
		if (!verified) {
			throw new OidcError(401, 'invalid_token', 'Token signature verification failed');
		}
		if (typeof payload.exp !== 'number' || payload.exp < nowEpochSeconds()) {
			throw new OidcError(401, 'invalid_token', 'Token expired');
		}

		return payload;
	}

	private validateScope(requested: string[], allowed: string[]): string[] {
		const invalid = requested.filter((scope) => !allowed.includes(scope));
		if (invalid.length > 0) {
			throw new OidcError(400, 'invalid_scope', `Unsupported scopes: ${invalid.join(', ')}`);
		}
		return requested;
	}

	private async collectFgacRelationsForToken(
		project: ProjectModel,
		userId: string,
	): Promise<{ fgac_relations: { resource_type: string; resource_id: string; relation: string }[]; fgac_truncated: boolean }> {
		const empty = { fgac_relations: [] as { resource_type: string; resource_id: string; relation: string }[], fgac_truncated: false };
		try {
			if (!this.env.PERMISSION_MANAGER) {
				return empty;
			}
			const config = buildProjectFgacConfig(project.id, project.fgacCustomDocTypes ?? []);
			const permEnv = this.env as unknown as PermissionServiceEnv<typeof config>;
			const management = createPermissionManagementService(permEnv, config);
			const docTypes = listMergedFgacDocTypes(project.fgacCustomDocTypes);
			const collected: { resource_type: string; resource_id: string; relation: string }[] = [];
			for (const docType of docTypes) {
				const res = await management.getUserRelations(userId, docType as (typeof config.docTypes)[number]);
				for (const r of res.relations) {
					collected.push({
						resource_type: r.type,
						resource_id: r.id,
						relation: r.relation,
					});
				}
			}
			collected.sort((a, b) => {
				const t = a.resource_type.localeCompare(b.resource_type);
				if (t !== 0) return t;
				const i = a.resource_id.localeCompare(b.resource_id);
				if (i !== 0) return i;
				return a.relation.localeCompare(b.relation);
			});
			const truncated = collected.length > FGAC_RELATIONS_MAX_IN_JWT;
			const fgac_relations = truncated ? collected.slice(0, FGAC_RELATIONS_MAX_IN_JWT) : collected;
			return { fgac_relations, fgac_truncated: truncated };
		} catch (error) {
			logger.warn('OIDC: skipped fgac_relations in token', {
				error: error instanceof Error ? error.message : String(error),
			});
			return empty;
		}
	}

	private async buildKeycloakStyleAccessClaims(
		project: ProjectModel,
		userId: string,
		oauthClientId: string,
	): Promise<{
		realm_access: { roles: string[] };
		resource_access: Record<string, { roles: string[] }>;
		fgac_relations: { resource_type: string; resource_id: string; relation: string }[];
		fgac_truncated: boolean;
	}> {
		const roles: string[] = [];
		const systemAdminId = (this.env.SYSTEM_ADMIN_USER_ID ?? '').trim();
		if (systemAdminId && systemAdminId === userId) {
			roles.push('system_admin');
		}

		const membership = await this.db.query.projectMemberships.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, project.id), eq(table.userId, userId), eq(table.isActive, true)),
		});

		if (membership && isProjectMemberRole(membership.role)) {
			roles.push(membership.role);
		}

		const roleList = [...roles];
		const { fgac_relations, fgac_truncated } = await this.collectFgacRelationsForToken(project, userId);
		return {
			realm_access: { roles: roleList },
			resource_access: {
				[oauthClientId]: { roles: [...roleList] },
			},
			fgac_relations,
			fgac_truncated,
		};
	}

	private async issueTokens(params: {
		project: ProjectModel;
		client: ClientRow;
		user: { id: string; email: string; name: string | null };
		scope: string[];
		origin: string;
		nonce?: string;
	}): Promise<TokenResponse> {
		const activeKey = await this.ensureActiveSigningKey(params.project.id);
		const privateJwk = parseJsonWebKey(activeKey.privateJwk, 'private');
		const now = nowEpochSeconds();
		const accessTtl = this.accessTokenTtlSeconds();
		const issuer = this.issuer(params.origin, params.project.slug);

		const { realm_access, resource_access, fgac_relations, fgac_truncated } =
			await this.buildKeycloakStyleAccessClaims(params.project, params.user.id, params.client.clientId);

		const accessPayload: Record<string, unknown> = {
			iss: issuer,
			sub: params.user.id,
			aud: params.client.clientId,
			iat: now,
			exp: now + accessTtl,
			scope: params.scope.join(' '),
			token_use: 'access',
			realm_access,
			resource_access,
			fgac_relations,
			...(fgac_truncated ? { fgac_truncated: true } : {}),
		};

		const idPayload: Record<string, unknown> = {
			iss: issuer,
			sub: params.user.id,
			aud: params.client.clientId,
			iat: now,
			exp: now + accessTtl,
			email: params.user.email,
			name: params.user.name,
		};
		if (params.nonce) {
			idPayload.nonce = params.nonce;
		}

		const header = {
			alg: 'RS256',
			typ: 'JWT',
			kid: activeKey.kid,
		};

		const accessToken = await this.signJwt(header, accessPayload, privateJwk);
		const idToken = await this.signJwt(header, idPayload, privateJwk);
		const refreshToken = this.randomToken(48);
		const refreshTokenHash = await this.sha256Hex(refreshToken);

		await this.db.insert(oidcRefreshTokens).values({
			id: crypto.randomUUID(),
			projectId: params.project.id,
			tokenHash: refreshTokenHash,
			clientId: params.client.clientId,
			userId: params.user.id,
			scope: params.scope.join(' '),
			expiresAt: new Date((now + this.refreshTokenTtlSeconds()) * 1000),
			revokedAt: null,
		});

		return {
			token_type: 'Bearer',
			access_token: accessToken,
			id_token: idToken,
			refresh_token: refreshToken,
			expires_in: accessTtl,
			scope: params.scope.join(' '),
		};
	}

	getDiscoveryMetadata(origin: string, projectSlug: string) {
		const issuer = this.issuer(origin, projectSlug);
		return {
			issuer,
			authorization_endpoint: `${issuer}/oidc/authorize`,
			token_endpoint: `${issuer}/oidc/token`,
			userinfo_endpoint: `${issuer}/oidc/userinfo`,
			jwks_uri: `${issuer}/oidc/jwks`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			scopes_supported: DEFAULT_SCOPES,
			token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
			code_challenge_methods_supported: ['S256', 'plain'],
		};
	}

	async getDiscoveryMetadataResponse(origin: string, projectSlug: string, clientId?: string) {
		const base = this.getDiscoveryMetadata(origin, projectSlug);
		const trimmed = clientId?.trim();
		if (!trimmed) {
			return base;
		}
		try {
			const project = await this.getProjectBySlug(projectSlug);
			const client = await this.getClient(project.id, trimmed);
			const redirectUris = await this.getRedirectUris(client.id);
			const canonical = Array.from(
				new Set(redirectUris.map((u) => normalizeRedirectUri(u)).filter((u) => u.length > 0)),
			);
			return { ...base, redirect_uris: canonical };
		} catch {
			return base;
		}
	}

	async getJwks(projectSlug: string): Promise<{ keys: OidcJwk[] }> {
		const project = await this.getProjectBySlug(projectSlug);
		const keys = await this.db.query.oidcSigningKeys.findMany({
			where: (table, { and, eq }) => and(eq(table.projectId, project.id), eq(table.isActive, true)),
		});

		const effectiveKeys = keys.length > 0 ? keys : [await this.ensureActiveSigningKey(project.id)];
		return {
			keys: effectiveKeys.map((key) => parseJsonWebKey(key.publicJwk, 'public')),
		};
	}

	async authorize(projectSlug: string, input: AuthorizeInput): Promise<{ redirectTo: string }> {
		if (input.responseType !== 'code') {
			throw new OidcError(400, 'unsupported_response_type', 'Only response_type=code is supported');
		}

		const project = await this.getProjectBySlug(projectSlug);
		const client = await this.getClient(project.id, input.clientId);
		const redirectUris = await this.getRedirectUris(client.id);
		if (!this.redirectUriIsRegistered(redirectUris, input.redirectUri)) {
			throw new OidcError(400, 'invalid_request', 'redirect_uri is not registered');
		}

		const requestedScopes = parseScope(input.scope);
		if (!requestedScopes.includes('openid')) {
			throw new OidcError(400, 'invalid_scope', 'openid scope is required', input.redirectUri, input.state);
		}

		const allowedScopes = await this.resolveAllowedScopes(project.id, client.id);
		this.validateScope(requestedScopes, allowedScopes);

		if (!input.codeChallenge) {
			throw new OidcError(400, 'invalid_request', 'code_challenge is required', input.redirectUri, input.state);
		}

		const method = input.codeChallengeMethod ?? 'S256';
		if (method !== 'S256' && method !== 'plain') {
			throw new OidcError(400, 'invalid_request', 'Unsupported code_challenge_method', input.redirectUri, input.state);
		}

		const sessionToken = input.authorizeSession?.trim();
		if (!sessionToken) {
			const hosted = this.env.OIDC_HOSTED_LOGIN_URL?.trim();
			if (hosted && input.authorizeRequestUrl) {
				try {
					const loginUrl = new URL(hosted);
					loginUrl.searchParams.set('return_url', input.authorizeRequestUrl);
					return { redirectTo: loginUrl.toString() };
				} catch {
					logger.warn('OIDC_HOSTED_LOGIN_URL is not a valid URL', { hosted });
				}
			}
			throw new OidcError(
				401,
				'login_required',
				'Sign in is required before authorization',
				input.redirectUri,
				input.state,
			);
		}

		const sessionHash = await this.sha256Hex(sessionToken);
		const [consumed] = await this.db
			.update(oidcAuthorizeSessions)
			.set({ consumedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(oidcAuthorizeSessions.tokenHash, sessionHash),
					isNull(oidcAuthorizeSessions.consumedAt),
					gt(oidcAuthorizeSessions.expiresAt, new Date()),
				),
			)
			.returning({ userId: oidcAuthorizeSessions.userId });

		if (!consumed) {
			throw new OidcError(
				400,
				'access_denied',
				'Invalid or expired sign-in session',
				input.redirectUri,
				input.state,
			);
		}

		const user = await findUserById(this.db, consumed.userId);
		if (!user) {
			throw new OidcError(
				400,
				'access_denied',
				'User not found',
				input.redirectUri,
				input.state,
			);
		}

		const hint = input.loginHint?.trim().toLowerCase();
		if (hint && hint !== user.email.toLowerCase()) {
			throw new OidcError(
				400,
				'access_denied',
				'login_hint does not match the signed-in user',
				input.redirectUri,
				input.state,
			);
		}

		const code = this.randomToken(32);

		await this.db.insert(oidcAuthorizationCodes).values({
			id: crypto.randomUUID(),
			projectId: project.id,
			code,
			clientId: client.clientId,
			userId: user.id,
			redirectUri: input.redirectUri,
			scope: requestedScopes.join(' '),
			nonce: input.nonce ?? null,
			codeChallenge: input.codeChallenge,
			codeChallengeMethod: method,
			expiresAt: new Date(Date.now() + this.codeTtlSeconds() * 1000),
			consumedAt: null,
		});

		return {
			redirectTo: buildClientRedirectUrl(this.env, input.redirectUri, {
				code,
				state: input.state,
			}),
		};
	}

	authorizeErrorRedirect(error: OidcError): string | null {
		if (!error.redirectUri) return null;
		return buildClientRedirectUrl(this.env, error.redirectUri, {
			error: error.error,
			error_description: error.description,
			state: error.state,
		});
	}

	async exchangeAuthorizationCode(
		projectSlug: string,
		input: TokenExchangeCodeInput,
		origin: string,
	): Promise<TokenResponse> {
		const project = await this.getProjectBySlug(projectSlug);
		const client = await this.authenticateClient(project.id, {
			clientId: input.clientId,
			clientSecret: input.clientSecret,
			basicAuth: input.basicAuth,
		});

		const codeRow = await this.db.query.oidcAuthorizationCodes.findFirst({
			where: (table, { and, eq, isNull }) =>
				and(
					eq(table.projectId, project.id),
					eq(table.code, input.code),
					eq(table.clientId, client.clientId),
					isNull(table.consumedAt),
				),
		});

		if (!codeRow) {
			throw new OidcError(400, 'invalid_grant', 'Authorization code is invalid or already used');
		}
		if (codeRow.expiresAt.getTime() <= Date.now()) {
			throw new OidcError(400, 'invalid_grant', 'Authorization code has expired');
		}
		if (normalizeRedirectUri(codeRow.redirectUri) !== normalizeRedirectUri(input.redirectUri)) {
			throw new OidcError(400, 'invalid_grant', 'redirect_uri does not match authorization request');
		}
		if (!input.codeVerifier) {
			throw new OidcError(400, 'invalid_request', 'code_verifier is required');
		}

		const method = codeRow.codeChallengeMethod ?? 'S256';
		if (method === 'S256') {
			const computed = await this.sha256Base64Url(input.codeVerifier);
			if (computed !== codeRow.codeChallenge) {
				throw new OidcError(400, 'invalid_grant', 'PKCE verification failed');
			}
		} else if (method === 'plain') {
			if (input.codeVerifier !== codeRow.codeChallenge) {
				throw new OidcError(400, 'invalid_grant', 'PKCE verification failed');
			}
		} else {
			throw new OidcError(400, 'invalid_grant', 'Unsupported PKCE method');
		}

		await this.db
			.update(oidcAuthorizationCodes)
			.set({ consumedAt: new Date(), updatedAt: new Date() })
			.where(eq(oidcAuthorizationCodes.id, codeRow.id));

		const user = await findUserById(this.db, codeRow.userId);
		if (!user) {
			throw new OidcError(400, 'invalid_grant', 'User not found');
		}

		return this.issueTokens({
			project,
			client,
			user,
			scope: parseScope(codeRow.scope),
			origin,
			nonce: codeRow.nonce ?? undefined,
		});
	}

	async exchangeRefreshToken(
		projectSlug: string,
		input: TokenExchangeRefreshInput,
		origin: string,
	): Promise<TokenResponse> {
		const project = await this.getProjectBySlug(projectSlug);
		const client = await this.authenticateClient(project.id, {
			clientId: input.clientId,
			clientSecret: input.clientSecret,
			basicAuth: input.basicAuth,
		});

		const tokenHash = await this.sha256Hex(input.refreshToken);
		const refresh = await this.db.query.oidcRefreshTokens.findFirst({
			where: (table, { and, eq, gt, isNull }) =>
				and(
					eq(table.projectId, project.id),
					eq(table.tokenHash, tokenHash),
					eq(table.clientId, client.clientId),
					isNull(table.revokedAt),
					gt(table.expiresAt, new Date()),
				),
		});

		if (!refresh) {
			throw new OidcError(400, 'invalid_grant', 'Refresh token is invalid or expired');
		}

		await this.db
			.update(oidcRefreshTokens)
			.set({ revokedAt: new Date(), updatedAt: new Date() })
			.where(eq(oidcRefreshTokens.id, refresh.id));

		const user = await findUserById(this.db, refresh.userId);
		if (!user) {
			throw new OidcError(400, 'invalid_grant', 'User not found');
		}

		return this.issueTokens({
			project,
			client,
			user,
			scope: parseScope(refresh.scope),
			origin,
		});
	}

	async getUserInfo(
		projectSlug: string,
		accessToken: string,
	): Promise<{
		sub: string;
		email?: string;
		name?: string | null;
		realm_access: { roles: string[] };
		resource_access: Record<string, { roles: string[] }>;
		fgac_relations: { resource_type: string; resource_id: string; relation: string }[];
		fgac_truncated: boolean;
	}> {
		const project = await this.getProjectBySlug(projectSlug);
		const payload = await this.verifyJwt(project.id, accessToken);
		if (payload.token_use !== 'access') {
			throw new OidcError(401, 'invalid_token', 'Provided token is not an access token');
		}
		if (typeof payload.sub !== 'string') {
			throw new OidcError(401, 'invalid_token', 'Token subject is missing');
		}

		const user = await findUserById(this.db, payload.sub);
		if (!user) {
			throw new OidcError(401, 'invalid_token', 'User not found');
		}

		const oauthClientId = oauthAudienceClientId(payload.aud) ?? 'openid';
		const claims = await this.buildKeycloakStyleAccessClaims(project, user.id, oauthClientId);

		return {
			sub: user.id,
			email: user.email,
			name: user.name,
			realm_access: claims.realm_access,
			resource_access: claims.resource_access,
			fgac_relations: claims.fgac_relations,
			fgac_truncated: claims.fgac_truncated,
		};
	}

	resolveDefaultProjectSlug(): string {
		const slug = this.env.OIDC_DEFAULT_PROJECT_SLUG?.trim();
		if (!slug) {
			throw new OidcError(400, 'invalid_request', 'OIDC default project is not configured');
		}
		return slug;
	}

	logUnexpectedError(error: unknown, context: string): void {
		logger.error('OIDC unexpected error', {
			context,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
