import * as jose from 'jose';

import {
	parseFgacPermissions,
	parseFgacRelations,
	parseFgacTruncated,
	parseRealmRoles,
	parseResourceAccess,
	parseScopeClaim,
} from './claims';
import type { FgacPermissionClaim, FgacRelationClaim } from './claims';
import { OidcTokenVerificationError } from './errors';

export type VerifiedAccessToken = Readonly<{
	subject: string;
	scopes: ReadonlySet<string>;
	realmRoles: readonly string[];
	resourceAccess: ReadonlyMap<string, readonly string[]>;
	fgacPermissions: readonly FgacPermissionClaim[];
	fgacRelations: readonly FgacRelationClaim[];
	fgacTruncated: boolean;
	claims: Readonly<Record<string, unknown>>;
}>;

function extractBearer(authorizationHeaderOrRawJwt: string): string {
	const t = authorizationHeaderOrRawJwt.trim();
	const p = 'Bearer ';
	if (t.length > p.length && t.slice(0, p.length).toLowerCase() === p.toLowerCase()) {
		return t.slice(p.length).trim();
	}
	return t;
}

function normalizeAllowedAudiences(raw: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const a of raw) {
		const s = a.trim();
		if (s.length > 0) {
			out.add(s);
		}
	}
	if (out.size === 0) {
		throw new TypeError('allowedAudiences must contain at least one non-empty string');
	}
	return out;
}

function audienceMatches(payload: jose.JWTPayload, allowed: ReadonlySet<string>): boolean {
	const aud = payload['aud'];
	if (aud === undefined || aud === null) {
		return false;
	}
	if (typeof aud === 'string') {
		return allowed.has(aud);
	}
	if (Array.isArray(aud)) {
		return aud.some((x) => typeof x === 'string' && allowed.has(x));
	}
	return false;
}

export type OidcAccessTokenVerifierOptions = Readonly<{
	issuer: string;
	jwksUri: string;
	allowedAudiences: Iterable<string>;
	algorithms?: readonly string[];
}>;

export class OidcAccessTokenVerifier {
	private readonly issuer: string;
	private readonly allowedAudiences: Set<string>;
	private readonly algorithms: string[];
	private readonly jwks: jose.JWTVerifyGetKey;

	constructor(options: OidcAccessTokenVerifierOptions) {
		this.issuer = options.issuer.trim();
		this.allowedAudiences = normalizeAllowedAudiences(options.allowedAudiences);
		this.algorithms = options.algorithms ? [...options.algorithms] : ['RS256'];
		this.jwks = jose.createRemoteJWKSet(new URL(options.jwksUri.trim()));
	}

	async verify(authorizationHeaderOrRawJwt: string): Promise<VerifiedAccessToken> {
		const token = extractBearer(authorizationHeaderOrRawJwt);
		let payload: jose.JWTPayload;
		try {
			const result = await jose.jwtVerify(token, this.jwks, {
				issuer: this.issuer,
				algorithms: this.algorithms,
			});
			payload = result.payload;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new OidcTokenVerificationError(`JWT verify failed: ${msg}`);
		}

		const tokenUse = payload['token_use'];
		if (typeof tokenUse === 'string' && tokenUse !== 'access') {
			throw new OidcTokenVerificationError('Expected access token (token_use)');
		}

		if (!audienceMatches(payload, this.allowedAudiences)) {
			throw new OidcTokenVerificationError('JWT aud does not include any configured allowed audience');
		}

		const sub = payload['sub'];
		if (typeof sub !== 'string' || sub.length === 0) {
			throw new OidcTokenVerificationError('JWT is missing sub');
		}

		const claims = payload as Record<string, unknown>;
		return {
			subject: sub,
			scopes: parseScopeClaim(claims['scope']),
			realmRoles: parseRealmRoles(claims),
			resourceAccess: parseResourceAccess(claims),
			fgacPermissions: parseFgacPermissions(claims),
			fgacRelations: parseFgacRelations(claims),
			fgacTruncated: parseFgacTruncated(claims),
			claims,
		};
	}
}

export function createAccessTokenVerifierFromDiscovery(
	discovery: { issuer: string; jwks_uri: string },
	allowedAudiences: Iterable<string>,
	options?: { algorithms?: readonly string[] },
): OidcAccessTokenVerifier {
	return new OidcAccessTokenVerifier({
		issuer: discovery.issuer,
		jwksUri: discovery.jwks_uri,
		allowedAudiences,
		algorithms: options?.algorithms,
	});
}
