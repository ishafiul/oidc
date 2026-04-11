export class OidcDiscoveryError extends Error {
	readonly name = 'OidcDiscoveryError';
	constructor(message: string) {
		super(message);
	}
}

export class OidcTokenVerificationError extends Error {
	readonly name = 'OidcTokenVerificationError';
	constructor(message: string) {
		super(message);
	}
}
