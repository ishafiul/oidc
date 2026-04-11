import { fetchOidcDiscovery, type FetchLike } from './discovery';
import { createAccessTokenVerifierFromDiscovery, type OidcAccessTokenVerifier } from './verify';

export async function createProjectAccessTokenVerifier(
	apiOrigin: string,
	projectSlug: string,
	allowedAudiences: Iterable<string>,
	options?: { algorithms?: readonly string[]; fetchImpl?: FetchLike },
): Promise<OidcAccessTokenVerifier> {
	const discovery = await fetchOidcDiscovery(apiOrigin, projectSlug, options?.fetchImpl);
	return createAccessTokenVerifierFromDiscovery(discovery, allowedAudiences, {
		algorithms: options?.algorithms,
	});
}
