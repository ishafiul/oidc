import 'claims.dart';
import 'fgac_schema.dart';

/// Reference to an FGAC resource (`type` + `id`). Use the same ids as in admin grants.
class FgacResourceRef {
  const FgacResourceRef({required this.type, required this.id});

  final String type;
  final String id;
}

/// Declarative check aligned with common `relation` / `anyOf` / `allOf` / `anyRelation` / `allRelations` patterns.
sealed class PermissionRequirement {
  const PermissionRequirement();
}

/// Require a specific relation on [resource] (JWT `fgac_relations` only).
class RequireRelation extends PermissionRequirement {
  const RequireRelation(this.relation, this.resource);

  final String relation;
  final FgacResourceRef resource;
}

/// Require any of [relations] on [resource].
class RequireAnyRelation extends PermissionRequirement {
  const RequireAnyRelation(this.relations, this.resource);

  final Set<String> relations;
  final FgacResourceRef resource;
}

/// Require all of [relations] on [resource].
class RequireAllRelations extends PermissionRequirement {
  const RequireAllRelations(this.relations, this.resource);

  final Set<String> relations;
  final FgacResourceRef resource;
}

/// Require at least one of [permissions] on [resource], using [schema] to expand relations.
class RequireAnyPermission extends PermissionRequirement {
  const RequireAnyPermission(this.permissions, this.resource, this.schema);

  final Set<String> permissions;
  final FgacResourceRef resource;
  final FgacSchema schema;
}

/// Require every permission in [permissions] on [resource], using [schema] to expand relations.
class RequireAllPermissions extends PermissionRequirement {
  const RequireAllPermissions(this.permissions, this.resource, this.schema);

  final Set<String> permissions;
  final FgacResourceRef resource;
  final FgacSchema schema;
}

/// Evaluates [requirement] using claims already present on [relations] (from a verified token).
bool satisfiesRequirement(
  List<FgacRelationClaim> fgacClaims,
  PermissionRequirement requirement,
  {List<FgacPermissionClaim>? fgacPermissions}
) {
  final permissionClaims = fgacPermissions ?? const <FgacPermissionClaim>[];
  return switch (requirement) {
    RequireRelation(:final relation, :final resource) => hasFgacRelation(
        fgacClaims,
        relation,
        resource.type,
        resource.id,
      ),
    RequireAnyRelation(relations: final relNames, resource: final resource) => hasAnyFgacRelation(
        fgacClaims,
        relNames,
        resource.type,
        resource.id,
      ),
    RequireAllRelations(relations: final relNames, resource: final resource) => hasAllFgacRelations(
        fgacClaims,
        relNames,
        resource.type,
        resource.id,
      ),
    RequireAnyPermission(:final permissions, :final resource, :final schema) =>
      _effectivePerms(
        fgacClaims,
        permissionClaims,
        resource,
        schema,
      ).intersection(permissions).isNotEmpty,
    RequireAllPermissions(:final permissions, :final resource, :final schema) =>
      permissions.every(_effectivePerms(fgacClaims, permissionClaims, resource, schema).contains),
  };
}

Set<String> _effectivePerms(
  List<FgacRelationClaim> relations,
  List<FgacPermissionClaim> permissionClaims,
  FgacResourceRef resource,
  FgacSchema schema,
) {
  // If explicit permission claims exist in token, trust them directly.
  if (permissionClaims.isNotEmpty) {
    final out = <String>{};
    for (final entry in permissionClaims) {
      if (entry.resourceType != resource.type) continue;
      if (entry.resourceId != resource.id && entry.resourceId != '*') continue;
      out.addAll(entry.permissions);
    }
    return out;
  }

  final held = relationsHeldOnResource(relations, resource.type, resource.id);
  return effectivePermissionsOnResource(
    schema: schema,
    resourceType: resource.type,
    relationNamesHeld: held,
  );
}
