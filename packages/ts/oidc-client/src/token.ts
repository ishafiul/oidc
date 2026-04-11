import { z } from 'zod';

import type { FetchLike } from './discovery';
import { OidcTokenEndpointError } from './errors';

const tokenSuccessSchema = z.object({
	access_token: z.string().min(1),
	token_type: z.string(),
	expires_in: z.number().optional(),
	refresh_token: z.string().optional(),
	id_token: z.string().optional(),
	scope: z.string().optional(),
});

export type TokenEndpointSuccess = z.infer<typeof tokenSuccessSchema>;

function formBody(params: Record<string, string>): string {
	const e = new URLSearchParams(params);
	return e.toString();
}

export type ExchangeAuthorizationCodeInput = Readonly<{
	tokenEndpoint: string;
	clientId: string;
	code: string;
	redirectUri: string;
	codeVerifier: string;
	clientSecret?: string;
	fetchImpl?: FetchLike;
}>;

export async function exchangeAuthorizationCode(
	input: ExchangeAuthorizationCodeInput,
): Promise<TokenEndpointSuccess> {
	const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const body: Record<string, string> = {
		grant_type: 'authorization_code',
		client_id: input.clientId,
		code: input.code,
		redirect_uri: input.redirectUri,
		code_verifier: input.codeVerifier,
	};
	const secret = input.clientSecret?.trim();
	if (secret) {
		body.client_secret = secret;
	}
	const res = await fetchImpl(input.tokenEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: formBody(body),
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		throw new OidcTokenEndpointError(`Token endpoint: invalid JSON (${res.status})`);
	}
	if (res.status < 200 || res.status >= 300) {
		throw new OidcTokenEndpointError(`Token endpoint failed (${res.status}): ${text}`);
	}
	const parsed = tokenSuccessSchema.safeParse(json);
	if (!parsed.success) {
		throw new OidcTokenEndpointError('Token endpoint: missing access_token');
	}
	return parsed.data;
}

export type RefreshAccessTokenInput = Readonly<{
	tokenEndpoint: string;
	clientId: string;
	refreshToken: string;
	clientSecret?: string;
	scope?: string;
	fetchImpl?: FetchLike;
}>;

export async function refreshAccessToken(input: RefreshAccessTokenInput): Promise<TokenEndpointSuccess> {
	const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const body: Record<string, string> = {
		grant_type: 'refresh_token',
		client_id: input.clientId,
		refresh_token: input.refreshToken,
	};
	const secret = input.clientSecret?.trim();
	if (secret) {
		body.client_secret = secret;
	}
	const sc = input.scope?.trim();
	if (sc) {
		body.scope = sc;
	}
	const res = await fetchImpl(input.tokenEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: formBody(body),
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = text.length > 0 ? JSON.parse(text) : null;
	} catch {
		throw new OidcTokenEndpointError(`Token endpoint: invalid JSON (${res.status})`);
	}
	if (res.status < 200 || res.status >= 300) {
		throw new OidcTokenEndpointError(`Token endpoint failed (${res.status}): ${text}`);
	}
	const parsed = tokenSuccessSchema.safeParse(json);
	if (!parsed.success) {
		throw new OidcTokenEndpointError('Token endpoint: missing access_token');
	}
	return parsed.data;
}
