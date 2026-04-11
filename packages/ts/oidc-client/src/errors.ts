export class OidcClientDiscoveryError extends Error {
	readonly name = 'OidcClientDiscoveryError';
	constructor(message: string) {
		super(message);
	}
}

export class OidcTokenEndpointError extends Error {
	readonly name = 'OidcTokenEndpointError';
	constructor(message: string) {
		super(message);
	}
}
