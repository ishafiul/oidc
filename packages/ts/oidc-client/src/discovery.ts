import { z } from 'zod';

import { OidcClientDiscoveryError } from './errors';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const clientDiscoverySchema = z.object({
	issuer: z.string().min(1),
	authorization_endpoint: z.string().min(1),
	token_endpoint: z.string().min(1),
	userinfo_endpoint: z.string().min(1),
	jwks_uri: z.string().min(1),
	redirect_uris: z.array(z.string().min(1)).optional(),
});

export type OidcClientDiscoveryDocument = z.infer<typeof clientDiscoverySchema>;

export async function fetchOidcClientDiscovery(
	discoveryUrl: string,
	fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<OidcClientDiscoveryDocument> {
	const res = await fetchImpl(discoveryUrl.trim(), { method: 'GET' });
	const text = await res.text();
	if (res.status < 200 || res.status >= 300) {
		throw new OidcClientDiscoveryError(`Discovery failed (${res.status}): ${text}`);
	}
	let json: unknown;
	try {
		json = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		throw new OidcClientDiscoveryError('Discovery: invalid JSON');
	}
	const parsed = clientDiscoverySchema.safeParse(json);
	if (!parsed.success) {
		throw new OidcClientDiscoveryError('Discovery: missing required fields');
	}
	return parsed.data;
}

export function projectDiscoveryUrl(apiOrigin: string, projectSlug: string): string {
	const origin = apiOrigin.trim().replace(/\/+$/, '');
	return `${origin}/projects/${encodeURIComponent(projectSlug)}/.well-known/openid-configuration`;
}
