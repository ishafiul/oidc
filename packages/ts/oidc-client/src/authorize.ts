export type BuildAuthorizationUrlInput = Readonly<{
	authorizationEndpoint: string;
	clientId: string;
	redirectUri: string;
	scope: string;
	state: string;
	codeChallenge: string;
	codeChallengeMethod?: 'S256' | 'plain';
	responseType?: 'code';
}>;

export function buildAuthorizationUrl(input: BuildAuthorizationUrlInput): string {
	const u = new URL(input.authorizationEndpoint);
	u.searchParams.set('client_id', input.clientId);
	u.searchParams.set('redirect_uri', input.redirectUri);
	u.searchParams.set('response_type', input.responseType ?? 'code');
	u.searchParams.set('scope', input.scope);
	u.searchParams.set('state', input.state);
	u.searchParams.set('code_challenge', input.codeChallenge);
	u.searchParams.set('code_challenge_method', input.codeChallengeMethod ?? 'S256');
	return u.toString();
}
