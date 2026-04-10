# oidc_resource_server

Dart library for **resource servers**: verify **project-scoped OIDC access tokens** (RS256 + JWKS) and evaluate **OAuth scopes**, **Keycloak-style realm/client roles**, and **FGAC tuples** embedded in the JWT.

Works with any Dart server stack (Shelf, Dart Frog, `dart:io` HTTP, gRPC interceptors, etc.)—only `async`/`await` and a `Authorization` header (or raw JWT string) are required.

## Setup

### 1. Add the dependency

From another package in the same repo (workspace root lists this package):

```yaml
dependencies:
  oidc_resource_server:
    path: ../packages/oidc_resource_server   # adjust relative path
```

Or use the path that matches your monorepo layout.

### 2. Configure your IdP values

You need the same values your SPA uses:

| Value | Meaning |
|--------|--------|
| **API origin** | Base URL of the OIDC API (e.g. `https://api.example.com` or `http://localhost:8787`) |
| **Project slug** | Path segment under `/projects/{slug}/…` (e.g. `default`) |
| **Allowed audiences** | OAuth **client_id** values for every app that may call this API (web SPA, mobile, admin, …). The access token’s `aud` must include **at least one** of these (each client normally has its own `client_id`). |

### 3. Create a verifier (once per process or isolate)

```dart
import 'package:oidc_resource_server/oidc_resource_server.dart';

late final OidcAccessTokenVerifier tokenVerifier;

Future<void> bootstrapAuth() async {
  final discovery = await fetchOidcDiscovery(
    apiOrigin: 'http://localhost:8787',
    projectSlug: 'default',
  );
  tokenVerifier = OidcAccessTokenVerifier.fromDiscovery(
    discovery: discovery,
    allowedAudiences: {
      'example-spa',
      'example-mobile',
      'example-admin',
    },
  );
}
```

Use a **single** entry in the set if you only have one client. You can also construct `OidcAccessTokenVerifier` directly with `issuer`, `allowedAudiences`, and `jwksUri` if you already know them (e.g. from config).

### 4. Verify on each request

```dart
Future<VerifiedAccessToken> authenticate(String authorizationHeader) async {
  return tokenVerifier.verify(authorizationHeader);
  // Accepts "Bearer <jwt>" or the raw compact JWT.
}
```

On failure, `verify` throws `OidcTokenVerificationException` (or `OidcDiscoveryException` from `fetchOidcDiscovery`).

## What the verifier checks

- **Signature** using keys from **`jwks_uri`** (fetched over HTTP; cached by the `jose` stack).
- **Algorithm** allowlist (default: `RS256`).
- **`iss`** matches the configured issuer (from discovery).
- **`aud`** overlaps your configured **allowed audiences** (each value is typically an OAuth **client_id**).
- **`exp`** / clock skew (via `jose` claim validation).
- **`token_use`** must be `access` when that claim is present.

It does **not** call token introspection or your FGAC HTTP API—authorization after verify is **local** to the JWT claims.

## Using the verified token

```dart
final token = await tokenVerifier.verify(request.headers['authorization']!);

if (!token.hasScope('demo:data:read')) {
  // 403
}

if (!token.hasRealmRole('editor')) {
  // 403
}

if (!token.hasFgacGrant('blog_post', postId, relation: 'editor')) {
  // 403
}

// Declarative checks (see below)
if (!token.satisfies(RequireRelation(
  'editor',
  FgacResourceRef(type: 'blog_post', id: postId),
))) {
  // 403
}
```

### Wildcard resource id

If the IdP put `resource_id: "*"` in `fgac_relations`, it matches **any** id for that `resource_type` (and optional relation). Same rule as the TypeScript example server.

### Truncated FGAC lists

If `token.fgacTruncated` is `true`, the JWT may omit some tuples. Do not rely on the JWT alone for high-stakes authorization until the user gets a fresh token or you perform a **server-side FGAC check** with a service credential.

## API reference

### Discovery

| API | Description |
|-----|-------------|
| **`fetchOidcDiscovery`**`({ required String apiOrigin, required String projectSlug, http.Client? httpClient })` → `Future<OidcDiscoveryDocument>` | GET `…/projects/{slug}/.well-known/openid-configuration`. |
| **`OidcDiscoveryDocument`** | `issuer`, `jwksUri`. |

### Verifier

| API | Description |
|-----|-------------|
| **`OidcAccessTokenVerifier`**`({ required String issuer, required Iterable<String> allowedAudiences, required String jwksUri, List<String> allowedAlgorithms })` | Manual constructor. `allowedAudiences` must be non-empty after trim. |
| **`OidcAccessTokenVerifier.fromDiscovery`**`({ required OidcDiscoveryDocument discovery, required Iterable<String> allowedAudiences, … })` | Factory using discovery. |
| **`verify`**`(String authorizationHeaderOrRawJwt)` → `Future<VerifiedAccessToken>` | Verifies and parses claims. |

### `VerifiedAccessToken`

| Member | Description |
|--------|-------------|
| **`subject`** | JWT `sub` (user id). |
| **`scopes`** | OAuth scopes from the `scope` claim (space-separated). |
| **`realmRoles`** | `realm_access.roles` (e.g. project membership role, `system_admin`). |
| **`resourceAccess`** | `resource_access` map: client id → role list (Keycloak-style mirror). |
| **`fgacRelations`** | Parsed `fgac_relations` tuples. |
| **`fgacTruncated`** | `fgac_truncated` claim. |
| **`claims`** | Full payload map for custom claims. |
| **`hasScope`**`(String)` | OAuth scope present. |
| **`hasRealmRole`**`(String)` | Role in `realmRoles`. |
| **`hasClientRole`**`(String oauthClientId, String role)` | Role under `resource_access[clientId]`. |
| **`hasFgacGrant`**`(resourceType, resourceId, { String? relation })` | FGAC tuple match; `relation` optional (any relation on that resource). |
| **`satisfies`**`(PermissionRequirement)` | See below. |

### Permission requirements (`PermissionRequirement`)

Aligned with common **relation / anyOf / allOf / anyRelation / allRelations** ideas; evaluation uses **only** what is in the JWT (plus an optional local **schema** for permission expansion).

| Class | Behavior |
|-------|----------|
| **`RequireRelation`**`(relation, FgacResourceRef)` | User has that **relation** on that resource (via `fgac_relations`). |
| **`RequireAnyRelation`**`(Set<String> relations, FgacResourceRef)` | At least one relation on that resource. |
| **`RequireAllRelations`**`(Set<String> relations, FgacResourceRef)` | Every listed relation on that resource. |
| **`RequireAnyPermission`**`(Set<String> permissions, FgacResourceRef, FgacSchema)` | Effective permission set (from held relations + schema) intersects `permissions`. |
| **`RequireAllPermissions`**`(…)` | Effective permission set contains every listed permission. |

**`FgacResourceRef`**: `type` + `id`—use the same **resource type and id** as in the admin FGAC grants.

**`satisfiesRequirement`**`(List<FgacRelationClaim>, PermissionRequirement)` → `bool` — same logic as `VerifiedAccessToken.satisfies`, useful for tests or custom pipelines.

### FGAC schema (for permission expansion)

| API | Description |
|-----|-------------|
| **`FgacRelationDefinition`** | `permissions: Set<String>`, `inherits: List<String>` (parent relation names). |
| **`FgacSchema`** | `Map<String, Map<String, FgacRelationDefinition>>` — document type → relation name → definition. |
| **`effectivePermissionsOnResource`**`({ required FgacSchema schema, required String resourceType, required Iterable<String> relationNamesHeld })` → `Set<String>` | Unfolds relations + inheritance into permission names. |
| **`relationsHeldOnResource`**`(List<FgacRelationClaim>, resourceType, resourceId)` → `Set<String>` | Relation names on that resource from JWT (includes `*` wildcard rows). |

Populate **`FgacSchema`** from your admin API (e.g. `GET /projects/:slug/permissions/relations/:type`) at startup or cache it; it must match the relations you define in the control plane.

### Low-level claim helpers

Useful if you verified a JWT elsewhere but want the same parsing rules:

| Function | Description |
|----------|-------------|
| **`parseScopeClaim`** | `scope` claim → `Set<String>`. |
| **`parseRealmRoles`** | `realm_access.roles`. |
| **`parseResourceAccess`** | `resource_access` map. |
| **`parseFgacRelations`** | `fgac_relations` list. |
| **`parseFgacTruncated`** | `fgac_truncated` bool. |
| **`matchesFgacGrant`** | Tuple match with optional relation filter + `*` resource id. |
| **`hasFgacRelation`** / **`hasAnyFgacRelation`** / **`hasAllFgacRelations`** | Convenience wrappers. |

### Exceptions

| Type | When |
|------|------|
| **`OidcResourceServerException`** | Base type. |
| **`OidcDiscoveryException`** | Discovery HTTP/JSON errors. |
| **`OidcTokenVerificationException`** | Verify / claim validation failures. |

## Tests

```bash
cd packages/oidc_resource_server
dart test
```

## Dependencies

- **`jose`** — JWS verify, JWKS URL loading.
- **`http`** — Discovery document fetch (`fetchOidcDiscovery`).
