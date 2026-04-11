import { z } from 'zod';

import { OidcDiscoveryError } from './errors';

const minimalDiscoverySchema = z.object({
	issuer: z.string().min(1),
	jwks_uri: z.string().min(1),
});

export type OidcMinimalDiscovery = z.infer<typeof minimalDiscoverySchema>;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function trimOrigin(origin: string): string {
	return origin.trim().replace(/\/+$/, '');
}

export async function fetchOidcDiscovery(
	apiOrigin: string,
	projectSlug: string,
	fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<OidcMinimalDiscovery> {
	const origin = trimOrigin(apiOrigin);
	const url = `${origin}/projects/${encodeURIComponent(projectSlug)}/.well-known/openid-configuration`;
	const res = await fetchImpl(url, { method: 'GET' });
	const text = await res.text();
	if (res.status < 200 || res.status >= 300) {
		throw new OidcDiscoveryError(`Discovery failed (${res.status}): ${text}`);
	}
	let json: unknown;
	try {
		json = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		throw new OidcDiscoveryError('Discovery: invalid JSON');
	}
	const parsed = minimalDiscoverySchema.safeParse(json);
	if (!parsed.success) {
		throw new OidcDiscoveryError('Discovery: missing issuer or jwks_uri');
	}
	return parsed.data;
}

export async function fetchOpenIdConfiguration(
	discoveryUrl: string,
	fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<OidcMinimalDiscovery> {
	const res = await fetchImpl(discoveryUrl.trim(), { method: 'GET' });
	const text = await res.text();
	if (res.status < 200 || res.status >= 300) {
		throw new OidcDiscoveryError(`Discovery failed (${res.status}): ${text}`);
	}
	let json: unknown;
	try {
		json = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		throw new OidcDiscoveryError('Discovery: invalid JSON');
	}
	const parsed = minimalDiscoverySchema.safeParse(json);
	if (!parsed.success) {
		throw new OidcDiscoveryError('Discovery: missing issuer or jwks_uri');
	}
	return parsed.data;
}
