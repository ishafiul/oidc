import 'claims.dart';

/// Relation definition for one document type (matches admin list-relations shape).
///
/// Pass a map from your FGAC schema so [effectivePermissionsOnResource] can expand
/// JWT relation tuples into permission names (with inheritance on relations only).
class FgacRelationDefinition {
  const FgacRelationDefinition({
    required this.permissions,
    this.inherits = const [],
  });

  final Set<String> permissions;
  final List<String> inherits;
}

/// `docType -> relationName -> definition`
typedef FgacSchema = Map<String, Map<String, FgacRelationDefinition>>;

Set<String> effectivePermissionsOnResource({
  required FgacSchema schema,
  required String resourceType,
  required Iterable<String> relationNamesHeld,
}) {
  final forType = schema[resourceType];
  if (forType == null || forType.isEmpty) {
    return {};
  }
  final effective = <String>{};
  final visitedRelations = <String>{};

  void visitRelation(String name) {
    if (!visitedRelations.add(name)) return;
    final def = forType[name];
    if (def == null) return;
    effective.addAll(def.permissions);
    for (final parent in def.inherits) {
      visitRelation(parent);
    }
  }

  for (final r in relationNamesHeld) {
    visitRelation(r);
  }
  return effective;
}

Set<String> relationsHeldOnResource(
  List<FgacRelationClaim> relations,
  String resourceType,
  String resourceId,
) {
  final names = <String>{};
  for (final r in relations) {
    if (r.resourceType != resourceType) continue;
    if (r.resourceId != resourceId && r.resourceId != '*') continue;
    names.add(r.relation);
  }
  return names;
}
