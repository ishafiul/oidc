import 'dart:convert';

class OidcFgacRelation {
  const OidcFgacRelation({
    required this.resourceType,
    required this.resourceId,
    required this.relation,
  });

  final String resourceType;
  final String resourceId;
  final String relation;
}

class OidcAccessTokenClaims {
  OidcAccessTokenClaims({
    required this.scopes,
    required this.realmRoles,
    required this.fgacRelations,
    required this.fgacTruncated,
    Map<String, dynamic> resourceAccess = const {},
  }) : _resourceAccess = resourceAccess;

  final Set<String> scopes;
  final List<String> realmRoles;
  final List<OidcFgacRelation> fgacRelations;
  final bool fgacTruncated;
  final Map<String, dynamic> _resourceAccess;

  bool hasScope(String scope) {
    final s = scope.trim();
    return s.isNotEmpty && scopes.contains(s);
  }

  bool hasRealmRole(String role) {
    final r = role.trim();
    return r.isNotEmpty && realmRoles.contains(r);
  }

  bool hasFgacRelation({
    required String resourceType,
    required String resourceId,
    required String relation,
  }) {
    final rt = resourceType.trim();
    final id = resourceId.trim();
    final rel = relation.trim();
    for (final e in fgacRelations) {
      if (e.resourceType == rt && e.resourceId == id && e.relation == rel) {
        return true;
      }
    }
    return false;
  }

  List<String> clientRoles(String clientId) {
    final id = clientId.trim();
    if (id.isEmpty) return [];
    final raw = _resourceAccess[id];
    if (raw is! Map) return [];
    final map = Map<String, dynamic>.from(raw);
    final roles = map['roles'];
    if (roles is! List) return [];
    return roles.whereType<String>().toList();
  }
}

OidcAccessTokenClaims? parseOidcAccessTokenClaims(String? accessToken) {
  final token = accessToken?.trim();
  if (token == null || token.isEmpty) {
    return null;
  }
  final parts = token.split('.');
  if (parts.length != 3) {
    return null;
  }
  Map<String, dynamic> payload;
  try {
    payload = _decodeJwtPart(parts[1]);
  } catch (_) {
    return null;
  }

  final scopes = <String>{};
  final scopeRaw = payload['scope'];
  if (scopeRaw is String) {
    for (final s in scopeRaw.split(RegExp(r'\s+'))) {
      if (s.isNotEmpty) scopes.add(s);
    }
  }

  final realmRoles = <String>[];
  final ra = payload['realm_access'];
  if (ra is Map<String, dynamic>) {
    final roles = ra['roles'];
    if (roles is List) {
      realmRoles.addAll(roles.whereType<String>());
    }
  }

  final fgac = <OidcFgacRelation>[];
  final fr = payload['fgac_relations'];
  if (fr is List) {
    for (final item in fr) {
      if (item is! Map<String, dynamic>) continue;
      final rt = item['resource_type'];
      final id = item['resource_id'];
      final rel = item['relation'];
      if (rt is String && id is String && rel is String) {
        fgac.add(OidcFgacRelation(resourceType: rt, resourceId: id, relation: rel));
      }
    }
  }

  final truncated = payload['fgac_truncated'] == true;

  Map<String, dynamic> resourceAccess = const {};
  final raMap = payload['resource_access'];
  if (raMap is Map) {
    resourceAccess = Map<String, dynamic>.from(raMap);
  }

  return OidcAccessTokenClaims(
    scopes: scopes,
    realmRoles: realmRoles,
    fgacRelations: fgac,
    fgacTruncated: truncated,
    resourceAccess: resourceAccess,
  );
}

Map<String, dynamic> _decodeJwtPart(String segment) {
  var s = segment;
  final pad = s.length % 4;
  if (pad > 0) {
    s = s.padRight(s.length + (4 - pad), '=');
  }
  s = s.replaceAll('-', '+').replaceAll('_', '/');
  final bytes = base64.decode(s);
  final decoded = utf8.decode(bytes);
  final json = jsonDecode(decoded);
  if (json is! Map<String, dynamic>) {
    throw const FormatException('JWT payload not a JSON object');
  }
  return json;
}
