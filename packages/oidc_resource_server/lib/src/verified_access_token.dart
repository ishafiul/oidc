import 'claims.dart';
import 'permission_checks.dart';

/// Verified OIDC access token for this workspace (signature + issuer + allowed audiences checked).
class VerifiedAccessToken {
  VerifiedAccessToken._({
    required this.subject,
    required this.scopes,
    required this.realmRoles,
    required this.resourceAccess,
    required this.fgacRelations,
    required this.fgacTruncated,
    required this.claims,
  });

  factory VerifiedAccessToken.fromClaimsMap(Map<String, dynamic> claims) {
    final sub = claims['sub'];
    if (sub is! String || sub.isEmpty) {
      throw ArgumentError.value(claims, 'claims', 'missing sub');
    }
    return VerifiedAccessToken._(
      subject: sub,
      scopes: parseScopeClaim(claims['scope']),
      realmRoles: parseRealmRoles(claims),
      resourceAccess: parseResourceAccess(claims),
      fgacRelations: parseFgacRelations(claims),
      fgacTruncated: parseFgacTruncated(claims),
      claims: Map<String, dynamic>.unmodifiable(Map<String, dynamic>.from(claims)),
    );
  }

  final String subject;
  final Set<String> scopes;
  final List<String> realmRoles;
  final Map<String, List<String>> resourceAccess;
  final List<FgacRelationClaim> fgacRelations;
  final bool fgacTruncated;

  /// Raw JWT payload (standard + custom claims).
  final Map<String, dynamic> claims;

  bool hasScope(String scope) => scopes.contains(scope);

  bool hasRealmRole(String role) => realmRoles.contains(role);

  bool hasClientRole(String oauthClientId, String role) {
    final list = resourceAccess[oauthClientId];
    return list?.contains(role) ?? false;
  }

  bool hasFgacGrant(
    String resourceType,
    String resourceId, {
    String? relation,
  }) {
    return matchesFgacGrant(fgacRelations, resourceType, resourceId, relation: relation);
  }

  /// High-level FGAC / permission-style check (see [PermissionRequirement]).
  bool satisfies(PermissionRequirement requirement) {
    return satisfiesRequirement(fgacRelations, requirement);
  }
}
