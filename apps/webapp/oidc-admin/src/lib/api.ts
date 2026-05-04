import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

type ProjectListItem = {
	readonly id: string;
	readonly slug: string;
	readonly name: string;
	readonly description: string | null;
};

type ProjectClient = {
	readonly id: string;
	readonly projectId: string;
	readonly clientId: string;
	readonly name: string;
	readonly isPublic: boolean;
	readonly isActive: boolean;
	readonly redirectUris: string[];
	readonly scopeSetIds: string[];
};

type ScopeSetItem = {
	readonly id: string;
	readonly projectId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isDefault: boolean;
	readonly isActive: boolean;
	readonly scopes: string[];
};

type ProjectMemberItem = {
	readonly id: string;
	readonly userId: string;
	readonly role: string;
	readonly user: {
		readonly id: string;
		readonly email: string;
		readonly name: string | null;
	} | null;
};

type RelationListResponse = {
	readonly relations: Record<string, { permissions: string[]; inherits: string[] }>;
};

export type FgacDocType = string;

export const SYSTEM_FGAC_DOC_TYPES = ['project', 'client', 'scope_set', 'user'] as const;

export const FGAC_DOC_TYPES: readonly string[] = [...SYSTEM_FGAC_DOC_TYPES];

export const FGAC_RELATIONS = ['viewer', 'editor', 'owner', 'member', 'admin'] as const;

export const FGAC_PERMISSION_NAMES = [
	'user',
	'read',
	'write',
	'admin',
	'superadmin',
	'manage_permissions',
] as const;

export type UserRelationEntry = {
	readonly type: string;
	readonly id: string;
	readonly relation: string;
	readonly expires_at: number | null;
};

export type ResourceRelationEntry = {
	readonly type: string;
	readonly id: string;
	readonly relation: string;
	readonly expires_at?: number | null;
};

export type ProjectFgacDocTypesMeta = {
	readonly system: readonly string[];
	readonly custom: readonly string[];
	readonly merged: readonly string[];
};

export type ProjectWithRole = ProjectListItem & {
	readonly role: string;
	readonly fgacDocTypes: ProjectFgacDocTypesMeta;
};

export type ProjectApiKeyScope = 'read_fgac_schema';

export type ProjectApiKeyListItem = {
	readonly id: string;
	readonly name: string;
	readonly keyPrefix: string;
	readonly scopes: readonly string[];
	readonly revokedAt: string | null;
	readonly lastUsedAt: string | null;
	readonly createdAt: string;
};

export type CreateProjectApiKeyResult = {
	readonly id: string;
	readonly keyPrefix: string;
	readonly apiKey: string;
	readonly scopes: readonly string[];
};

export type AdminUserRow = {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
	readonly phoneNumber: string | null;
	readonly avatarUrl: string | null;
	readonly isBanned: boolean;
	readonly bannedAt: string | null;
	readonly bannedUntil: string | null;
	readonly banReason: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly sessions: AdminUserSession[];
};

export type AdminDeviceInfo = {
	readonly id: string;
	readonly fingerprint: string | null;
	readonly deviceType: string | null;
	readonly osName: string | null;
	readonly osVersion: string | null;
	readonly deviceModel: string | null;
	readonly isPhysicalDevice: string | null;
	readonly appVersion: string | null;
	readonly ipAddress: string | null;
	readonly city: string | null;
	readonly countryCode: string | null;
	readonly isp: string | null;
	readonly colo: string | null;
	readonly longitude: string | null;
	readonly latitude: string | null;
	readonly timezone: string | null;
	readonly hasFcmToken: boolean;
	readonly fcmToken: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type AdminUserSession = {
	readonly id: string;
	readonly userId: string;
	readonly deviceId: string;
	readonly lastRefresh: string | null;
	readonly isTrusted: boolean;
	readonly trustedAt: string | null;
	readonly activeUntil: string | null;
	readonly isActive: boolean;
	readonly device: AdminDeviceInfo | null;
};

type OrpcClient = {
	adminRoutes: {
		listUsers: () => Promise<AdminUserRow[]>;
		updateUser: (input: {
			params: { userId: string };
			body: {
				name?: string | null;
				isBanned?: boolean;
				banReason?: string | null;
				bannedUntil?: string | null;
			};
		}) => Promise<AdminUserRow>;
	};
	authRoutes: {
		requestAdminOtp: (input: { body: { email: string; turnstileToken?: string } }) => Promise<{ success: boolean; message: string }>;
		verifyAdminOtp: (input: { body: { email: string; otp: number } }) => Promise<{
			success: boolean;
			message: string;
			accessToken: string;
			csrfToken: string;
			user: AdminUser;
		}>;
		getAdminSession: () => Promise<{ authenticated: boolean; user: AdminUser | null }>;
		adminLogout: () => Promise<{ success: boolean }>;
	};
	projectRoutes: {
		listProjects: () => Promise<ProjectListItem[]>;
		createProject: (input: { body: { name: string; slug?: string; description?: string | null } }) => Promise<ProjectListItem>;
		listClients: (input: { params: { slug: string } }) => Promise<ProjectClient[]>;
		createClient: (input: { params: { slug: string }; body: { name: string; clientId: string; isPublic: boolean; redirectUris: string[]; scopeSetIds?: string[] } }) => Promise<ProjectClient>;
		updateClient: (input: {
			params: { slug: string; clientId: string };
			body: { name?: string; isPublic?: boolean; isActive?: boolean };
		}) => Promise<ProjectClient>;
		addClientRedirectUri: (input: {
			params: { slug: string; clientId: string };
			body: { redirectUri: string };
		}) => Promise<{ ok: true }>;
		removeClientRedirectUri: (input: {
			params: { slug: string; clientId: string };
			body: { redirectUri: string };
		}) => Promise<{ ok: true }>;
		attachClientScopeSet: (input: {
			params: { slug: string; clientId: string };
			body: { scopeSetId: string };
		}) => Promise<{ ok: true }>;
		detachClientScopeSet: (input: {
			params: { slug: string; clientId: string };
			body: { scopeSetId: string };
		}) => Promise<{ ok: true }>;
		listScopeSets: (input: { params: { slug: string } }) => Promise<ScopeSetItem[]>;
		createScopeSet: (input: { params: { slug: string }; body: { name: string; description?: string | null; scopes: string[]; isDefault?: boolean } }) => Promise<ScopeSetItem>;
		updateScopeSet: (input: {
			params: { slug: string; scopeSetId: string };
			body: { name?: string; description?: string | null; isActive?: boolean };
		}) => Promise<ScopeSetItem>;
		deactivateScopeSet: (input: { params: { slug: string; scopeSetId: string } }) => Promise<ScopeSetItem>;
		addScopeToSet: (input: { params: { slug: string; scopeSetId: string }; body: { scope: string } }) => Promise<{ ok: true }>;
		removeScopeFromSet: (input: { params: { slug: string; scopeSetId: string }; body: { scope: string } }) => Promise<{ ok: true }>;
		listMembers: (input: { params: { slug: string } }) => Promise<ProjectMemberItem[]>;
		inviteMember: (input: { params: { slug: string }; body: { email: string; role: ProjectRole } }) => Promise<unknown>;
		updateMemberRole: (input: { params: { slug: string }; body: { userId: string; role: ProjectRole } }) => Promise<unknown>;
		getProject: (input: { params: { slug: string } }) => Promise<ProjectWithRole>;
		listProjectRelations: (input: { params: { slug: string; type: FgacDocType } }) => Promise<RelationListResponse>;
		defineProjectRelation: (input: {
			params: { slug: string };
			body: { type: FgacDocType; relation: string; permissions: string[]; inherits?: string[] };
		}) => Promise<{ ok: boolean }>;
		deleteProjectRelation: (input: { params: { slug: string }; body: { type: FgacDocType; relation: string } }) => Promise<{ ok: boolean }>;
		grantProjectRelation: (input: {
			params: { slug: string };
			body: { subject: string; relation: string; resource: { type: FgacDocType; id: string }; expiresAt?: number | null };
		}) => Promise<{ ok: boolean }>;
		revokeProjectRelation: (input: {
			params: { slug: string };
			body: { subject: string; relation: string; resource: { type: FgacDocType; id: string } };
		}) => Promise<{ ok: boolean }>;
		getProjectUserRelations: (input: { params: { slug: string; userId: string; type: FgacDocType } }) => Promise<{
			relations: UserRelationEntry[];
		}>;
		listProjectGroups: (input: { params: { slug: string } }) => Promise<{ groups: string[] }>;
		getProjectGroupMembers: (input: { params: { slug: string; group: string } }) => Promise<{ users: string[] }>;
		getProjectGroupRelations: (input: { params: { slug: string; group: string } }) => Promise<{
			groups: Record<string, ResourceRelationEntry[]>;
		}>;
		addProjectUserToGroup: (input: { params: { slug: string }; body: { user: string; group: string } }) => Promise<{ ok: boolean }>;
		removeProjectUserFromGroup: (input: { params: { slug: string }; body: { user: string; group: string } }) => Promise<{ ok: boolean }>;
		getProjectAllPermissions: (input: {
			params: { slug: string };
			body: { resource: { type: FgacDocType; id: string }; bypassCache?: boolean };
		}) => Promise<{ permissions: string[]; relations: string[] }>;
		addProjectFgacDocType: (input: {
			params: { slug: string };
			body: { name: string };
		}) => Promise<{ ok: true; mergedDocTypes: string[] }>;
		removeProjectFgacDocType: (input: {
			params: { slug: string };
			body: { name: string };
		}) => Promise<{ ok: true; mergedDocTypes: string[] }>;
		listProjectApiKeys: (input: { params: { slug: string } }) => Promise<ProjectApiKeyListItem[]>;
		createProjectApiKey: (input: {
			params: { slug: string };
			body: { name?: string; scopes: ProjectApiKeyScope[] };
		}) => Promise<CreateProjectApiKeyResult>;
		revokeProjectApiKey: (input: { params: { slug: string; keyId: string } }) => Promise<{ ok: true }>;
	};
};

const ADMIN_CSRF_SESSION_KEY = 'oidc_admin_csrf';
const ADMIN_ACCESS_TOKEN_KEY = 'oidc_admin_access_token';

export function setAdminAccessToken(token: string): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, token);
}

export function clearAdminAccessToken(): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
}

function getAdminAccessToken(): string | null {
	if (typeof sessionStorage === 'undefined') {
		return null;
	}
	return sessionStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
}

export function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

function readDocumentCookieAllValues(name: string): string[] {
	const encoded = encodeURIComponent(name) + '=';
	const all = document.cookie.split(';');
	const out: string[] = [];
	for (const item of all) {
		const value = item.trim();
		if (value.startsWith(encoded)) {
			out.push(decodeURIComponent(value.slice(encoded.length)));
		}
	}
	return out;
}

function readDocumentCookie(name: string): string | null {
	const values = readDocumentCookieAllValues(name);
	return values[values.length - 1] ?? null;
}

export function setAdminCsrfToken(token: string): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.setItem(ADMIN_CSRF_SESSION_KEY, token);
}

export function clearAdminCsrfToken(): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.removeItem(ADMIN_CSRF_SESSION_KEY);
}

export function hydrateAdminCsrfFromCookie(): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	if (sessionStorage.getItem(ADMIN_CSRF_SESSION_KEY)) {
		return;
	}
	const cookieName = import.meta.env.VITE_ADMIN_CSRF_COOKIE_NAME ?? 'oidc_admin_csrf';
	const fromCookie = readDocumentCookie(cookieName);
	if (fromCookie) {
		sessionStorage.setItem(ADMIN_CSRF_SESSION_KEY, fromCookie);
	}
}

function getCsrfToken(): string | null {
	const cookieName = import.meta.env.VITE_ADMIN_CSRF_COOKIE_NAME ?? 'oidc_admin_csrf';
	const fromCookies = readDocumentCookieAllValues(cookieName);
	const lastCookie = fromCookies[fromCookies.length - 1];
	if (lastCookie) {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(ADMIN_CSRF_SESSION_KEY, lastCookie);
		}
		return lastCookie;
	}
	if (typeof sessionStorage !== 'undefined') {
		return sessionStorage.getItem(ADMIN_CSRF_SESSION_KEY);
	}
	return null;
}

function createClient(baseUrl: string): OrpcClient {
	const url = `${normalizeBaseUrl(baseUrl)}/rpc`;
	return createORPCClient<OrpcClient>(
		new RPCLink({
			url,
			fetch: async (input, init) => {
				return fetch(input, {
					...init,
					credentials: 'include',
				});
			},
			headers: () => {
				const csrfToken = getCsrfToken();
				const bearer = getAdminAccessToken();
				const headers: Record<string, string> = {};
				if (bearer) {
					headers.Authorization = `Bearer ${bearer}`;
				}
				if (csrfToken) {
					headers['x-csrf-token'] = csrfToken;
				}
				return headers;
			},
		}),
	);
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, {
		...init,
		credentials: 'include',
	});
	const raw = await response.text();
	let parsed: unknown = null;
	if (raw) {
		try {
			parsed = JSON.parse(raw);
		} catch {
			parsed = raw;
		}
	}

	if (!response.ok) {
		const message =
			typeof parsed === 'object' &&
			parsed !== null &&
			'error_description' in parsed &&
			typeof (parsed as { error_description?: unknown }).error_description === 'string'
				? ((parsed as { error_description: string }).error_description ?? `Request failed (${response.status})`)
				: `Request failed (${response.status})`;
		throw new Error(message);
	}

	return parsed as T;
}

export type AdminUser = {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
};

export async function requestAdminOtp(baseUrl: string, email: string, turnstileToken?: string) {
	const client = createClient(baseUrl);
	return client.authRoutes.requestAdminOtp({
		body: { email, turnstileToken },
	});
}

export async function verifyAdminOtp(baseUrl: string, email: string, otp: number) {
	const client = createClient(baseUrl);
	return client.authRoutes.verifyAdminOtp({
		body: { email, otp },
	});
}

export async function getAdminSession(baseUrl: string): Promise<{
	authenticated: boolean;
	user: AdminUser | null;
}> {
	const client = createClient(baseUrl);
	return client.authRoutes.getAdminSession();
}

export async function logoutAdmin(baseUrl: string) {
	const client = createClient(baseUrl);
	try {
		return await client.authRoutes.adminLogout();
	} finally {
		clearAdminCsrfToken();
		clearAdminAccessToken();
	}
}

export async function listAdminUsers(baseUrl: string) {
	const client = createClient(baseUrl);
	return client.adminRoutes.listUsers();
}

export async function updateAdminUser(
	baseUrl: string,
	userId: string,
	body: {
		name?: string | null;
		isBanned?: boolean;
		banReason?: string | null;
		bannedUntil?: string | null;
	},
) {
	const client = createClient(baseUrl);
	return client.adminRoutes.updateUser({
		params: { userId },
		body,
	});
}

export async function listProjects(baseUrl: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listProjects();
}

export async function createProject(
	baseUrl: string,
	input: { name: string; slug?: string; description?: string | null },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.createProject({
		body: input,
	});
}

export async function listClients(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listClients({
		params: { slug },
	});
}

export async function createClientInProject(
	baseUrl: string,
	slug: string,
	input: {
		name: string;
		clientId: string;
		isPublic: boolean;
		redirectUris: string[];
		scopeSetIds?: string[];
	},
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.createClient({
		params: { slug },
		body: input,
	});
}

export async function updateClientInProject(
	baseUrl: string,
	slug: string,
	clientId: string,
	body: { name?: string; isPublic?: boolean; isActive?: boolean },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.updateClient({
		params: { slug, clientId },
		body,
	});
}

export async function addClientRedirectUri(
	baseUrl: string,
	slug: string,
	clientId: string,
	redirectUri: string,
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.addClientRedirectUri({
		params: { slug, clientId },
		body: { redirectUri },
	});
}

export async function removeClientRedirectUri(
	baseUrl: string,
	slug: string,
	clientId: string,
	redirectUri: string,
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.removeClientRedirectUri({
		params: { slug, clientId },
		body: { redirectUri },
	});
}

export async function attachClientScopeSet(
	baseUrl: string,
	slug: string,
	clientId: string,
	scopeSetId: string,
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.attachClientScopeSet({
		params: { slug, clientId },
		body: { scopeSetId },
	});
}

export async function detachClientScopeSet(
	baseUrl: string,
	slug: string,
	clientId: string,
	scopeSetId: string,
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.detachClientScopeSet({
		params: { slug, clientId },
		body: { scopeSetId },
	});
}

export async function listScopeSets(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listScopeSets({
		params: { slug },
	});
}

export async function createScopeSet(
	baseUrl: string,
	slug: string,
	input: {
		name: string;
		description?: string | null;
		scopes: string[];
		isDefault?: boolean;
	},
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.createScopeSet({
		params: { slug },
		body: input,
	});
}

export async function updateScopeSet(
	baseUrl: string,
	slug: string,
	scopeSetId: string,
	body: { name?: string; description?: string | null; isActive?: boolean },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.updateScopeSet({
		params: { slug, scopeSetId },
		body,
	});
}

export async function deactivateScopeSet(baseUrl: string, slug: string, scopeSetId: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.deactivateScopeSet({
		params: { slug, scopeSetId },
	});
}

export async function addScopeToSet(baseUrl: string, slug: string, scopeSetId: string, scope: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.addScopeToSet({
		params: { slug, scopeSetId },
		body: { scope },
	});
}

export async function removeScopeFromSet(baseUrl: string, slug: string, scopeSetId: string, scope: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.removeScopeFromSet({
		params: { slug, scopeSetId },
		body: { scope },
	});
}

export async function listMembers(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listMembers({
		params: { slug },
	});
}

export async function inviteMember(
	baseUrl: string,
	slug: string,
	input: { email: string; role: ProjectRole },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.inviteMember({
		params: { slug },
		body: input,
	});
}

export async function updateMemberRole(
	baseUrl: string,
	slug: string,
	input: { userId: string; role: ProjectRole },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.updateMemberRole({
		params: { slug },
		body: input,
	});
}

export async function getProject(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.getProject({ params: { slug } });
}

export async function addProjectFgacDocType(baseUrl: string, slug: string, name: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.addProjectFgacDocType({
		params: { slug },
		body: { name },
	});
}

export async function removeProjectFgacDocType(baseUrl: string, slug: string, name: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.removeProjectFgacDocType({
		params: { slug },
		body: { name },
	});
}

export async function listRelations(baseUrl: string, slug: string, type: FgacDocType) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listProjectRelations({
		params: {
			slug,
			type,
		},
	});
}

export async function defineProjectRelation(
	baseUrl: string,
	slug: string,
	body: { type: FgacDocType; relation: string; permissions: string[]; inherits?: string[] },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.defineProjectRelation({ params: { slug }, body });
}

export async function deleteProjectRelation(baseUrl: string, slug: string, body: { type: FgacDocType; relation: string }) {
	const client = createClient(baseUrl);
	return client.projectRoutes.deleteProjectRelation({ params: { slug }, body });
}

export async function grantRelation(
	baseUrl: string,
	slug: string,
	input: {
		subject: string;
		relation: string;
		resource: { type: FgacDocType; id: string };
		expiresAt?: number | null;
	},
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.grantProjectRelation({
		params: { slug },
		body: input,
	});
}

export async function revokeRelation(
	baseUrl: string,
	slug: string,
	input: { subject: string; relation: string; resource: { type: FgacDocType; id: string } },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.revokeProjectRelation({
		params: { slug },
		body: input,
	});
}

export async function getUserFgacRelations(baseUrl: string, slug: string, userId: string, type: FgacDocType) {
	const client = createClient(baseUrl);
	return client.projectRoutes.getProjectUserRelations({
		params: { slug, userId, type },
	});
}

export async function listProjectGroups(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listProjectGroups({ params: { slug } });
}

export async function getProjectGroupMembers(baseUrl: string, slug: string, group: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.getProjectGroupMembers({ params: { slug, group } });
}

export async function getProjectGroupRelations(baseUrl: string, slug: string, group: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.getProjectGroupRelations({ params: { slug, group } });
}

export async function addUserToProjectGroup(baseUrl: string, slug: string, body: { user: string; group: string }) {
	const client = createClient(baseUrl);
	return client.projectRoutes.addProjectUserToGroup({ params: { slug }, body });
}

export async function removeUserFromProjectGroup(baseUrl: string, slug: string, body: { user: string; group: string }) {
	const client = createClient(baseUrl);
	return client.projectRoutes.removeProjectUserFromGroup({ params: { slug }, body });
}

export async function getMyPermissionsOnResource(
	baseUrl: string,
	slug: string,
	resource: { type: FgacDocType; id: string },
	bypassCache?: boolean,
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.getProjectAllPermissions({
		params: { slug },
		body: { resource, bypassCache },
	});
}

export interface OidcDiscoveryMetadata {
	readonly issuer: string;
	readonly authorization_endpoint: string;
	readonly token_endpoint: string;
	readonly userinfo_endpoint: string;
	readonly jwks_uri: string;
	readonly response_types_supported: readonly string[];
	readonly subject_types_supported: readonly string[];
	readonly id_token_signing_alg_values_supported: readonly string[];
	readonly scopes_supported: readonly string[];
	readonly token_endpoint_auth_methods_supported: readonly string[];
	readonly [key: string]: unknown;
}

export interface OidcJwksResponse {
	readonly keys: readonly Record<string, unknown>[];
}

export async function fetchProjectDiscovery(
	baseUrl: string,
	projectSlug: string,
): Promise<OidcDiscoveryMetadata> {
	return requestJson<OidcDiscoveryMetadata>(
		`${normalizeBaseUrl(baseUrl)}/projects/${projectSlug}/.well-known/openid-configuration`,
	);
}

export async function fetchProjectJwks(
	baseUrl: string,
	projectSlug: string,
): Promise<OidcJwksResponse> {
	return requestJson<OidcJwksResponse>(
		`${normalizeBaseUrl(baseUrl)}/projects/${projectSlug}/oidc/jwks`,
	);
}

export async function listProjectApiKeys(baseUrl: string, slug: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.listProjectApiKeys({ params: { slug } });
}

export async function createProjectApiKey(
	baseUrl: string,
	slug: string,
	body: { name?: string; scopes: ProjectApiKeyScope[] },
) {
	const client = createClient(baseUrl);
	return client.projectRoutes.createProjectApiKey({ params: { slug }, body });
}

export async function revokeProjectApiKey(baseUrl: string, slug: string, keyId: string) {
	const client = createClient(baseUrl);
	return client.projectRoutes.revokeProjectApiKey({ params: { slug, keyId } });
}
