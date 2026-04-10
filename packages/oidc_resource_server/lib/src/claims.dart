/// One FGAC tuple embedded in the access token (`fgac_relations` claim).
class FgacRelationClaim {
  const FgacRelationClaim({
    required this.resourceType,
    required this.resourceId,
    required this.relation,
  });

  final String resourceType;
  final String resourceId;
  final String relation;
}

Set<String> parseScopeClaim(Object? scope) {
  if (scope is! String || scope.isEmpty) {
    return {};
  }
  return scope.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toSet();
}

List<String> parseRealmRoles(Map<String, dynamic> claims) {
  final raw = claims['realm_access'];
  if (raw is! Map<String, dynamic>) {
    return const [];
  }
  final roles = raw['roles'];
  if (roles is! List) {
    return const [];
  }
  return roles.whereType<String>().toList();
}

Map<String, List<String>> parseResourceAccess(Map<String, dynamic> claims) {
  final raw = claims['resource_access'];
  if (raw is! Map<String, dynamic>) {
    return {};
  }
  final out = <String, List<String>>{};
  for (final e in raw.entries) {
    final v = e.value;
    if (v is! Map<String, dynamic>) continue;
    final roles = v['roles'];
    if (roles is! List) continue;
    out[e.key] = roles.whereType<String>().toList();
  }
  return out;
}

List<FgacRelationClaim> parseFgacRelations(Map<String, dynamic> claims) {
  final raw = claims['fgac_relations'];
  if (raw is! List) {
    return const [];
  }
  final out = <FgacRelationClaim>[];
  for (final item in raw) {
    if (item is! Map<String, dynamic>) continue;
    final t = item['resource_type'];
    final id = item['resource_id'];
    final r = item['relation'];
    if (t is String && id is String && r is String) {
      out.add(FgacRelationClaim(resourceType: t, resourceId: id, relation: r));
    }
  }
  return out;
}

bool parseFgacTruncated(Map<String, dynamic> claims) {
  return claims['fgac_truncated'] == true;
}

bool matchesFgacGrant(
  List<FgacRelationClaim> relations,
  String resourceType,
  String resourceId, {
  String? relation,
}) {
  for (final r in relations) {
    if (r.resourceType != resourceType) continue;
    if (relation != null && r.relation != relation) continue;
    if (r.resourceId != resourceId && r.resourceId != '*') continue;
    return true;
  }
  return false;
}

bool hasFgacRelation(
  List<FgacRelationClaim> relations,
  String relation,
  String resourceType,
  String resourceId,
) {
  return matchesFgacGrant(relations, resourceType, resourceId, relation: relation);
}

bool hasAnyFgacRelation(
  List<FgacRelationClaim> relations,
  Set<String> relationsToTry,
  String resourceType,
  String resourceId,
) {
  for (final rel in relationsToTry) {
    if (hasFgacRelation(relations, rel, resourceType, resourceId)) {
      return true;
    }
  }
  return false;
}

bool hasAllFgacRelations(
  List<FgacRelationClaim> relations,
  Set<String> relationsToTry,
  String resourceType,
  String resourceId,
) {
  for (final rel in relationsToTry) {
    if (!hasFgacRelation(relations, rel, resourceType, resourceId)) {
      return false;
    }
  }
  return true;
}
