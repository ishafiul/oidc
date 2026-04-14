export {
	parseFgacRelations,
	parseFgacPermissions,
	parseFgacTruncated,
	parseRealmRoles,
	parseResourceAccess,
	parseScopeClaim,
	fgacPermissionEntrySchema,
	fgacRelationEntrySchema,
	hasFgacPermission,
	matchesFgacGrant,
	relationsHeldOnResource,
	type FgacPermissionClaim,
	type FgacRelationClaim,
} from './claims';
export {
	effectivePermissionsOnResource,
	satisfiesRequirement,
	type FgacRelationDefinition,
	type FgacResourceRef,
	type FgacSchema,
	type PermissionRequirement,
} from './fgac-schema';
export { fetchOidcDiscovery, fetchOpenIdConfiguration, type OidcMinimalDiscovery, type FetchLike } from './discovery';
export { OidcDiscoveryError, OidcTokenVerificationError } from './errors';
export {
	OidcAccessTokenVerifier,
	createAccessTokenVerifierFromDiscovery,
	type VerifiedAccessToken,
	type OidcAccessTokenVerifierOptions,
} from './verify';
export { createProjectAccessTokenVerifier } from './bootstrap';
