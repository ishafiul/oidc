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
) {
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
      _effectivePerms(fgacClaims, resource, schema).intersection(permissions).isNotEmpty,
    RequireAllPermissions(:final permissions, :final resource, :final schema) =>
      permissions.every(_effectivePerms(fgacClaims, resource, schema).contains),
  };
}

Set<String> _effectivePerms(
  List<FgacRelationClaim> relations,
  FgacResourceRef resource,
  FgacSchema schema,
) {
  final held = relationsHeldOnResource(relations, resource.type, resource.id);
  return effectivePermissionsOnResource(
    schema: schema,
    resourceType: resource.type,
    relationNamesHeld: held,
  );
}
