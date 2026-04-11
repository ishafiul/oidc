import type { FgacRelationClaim } from './claims';
import { relationsHeldOnResource } from './claims';

export type FgacRelationDefinition = Readonly<{
	permissions: ReadonlySet<string>;
	inherits: readonly string[];
}>;

export type FgacSchema = Readonly<
	Record<string, Readonly<Record<string, FgacRelationDefinition | undefined> | undefined> | undefined>
>;

export function effectivePermissionsOnResource(input: {
	schema: FgacSchema;
	resourceType: string;
	relationNamesHeld: Iterable<string>;
}): Set<string> {
	const forType = input.schema[input.resourceType];
	if (forType === undefined) {
		return new Set();
	}
	const definitions = forType;
	const effective = new Set<string>();
	const visited = new Set<string>();

	function visitRelation(name: string): void {
		if (visited.has(name)) {
			return;
		}
		visited.add(name);
		const def = definitions[name];
		if (def === undefined) {
			return;
		}
		for (const p of def.permissions) {
			effective.add(p);
		}
		for (const parent of def.inherits) {
			visitRelation(parent);
		}
	}

	for (const r of input.relationNamesHeld) {
		visitRelation(r);
	}
	return effective;
}

export type FgacResourceRef = Readonly<{ type: string; id: string }>;

export type PermissionRequirement =
	| { kind: 'relation'; relation: string; resource: FgacResourceRef }
	| { kind: 'anyRelation'; relations: ReadonlySet<string>; resource: FgacResourceRef }
	| { kind: 'allRelations'; relations: ReadonlySet<string>; resource: FgacResourceRef }
	| {
			kind: 'anyPermission';
			permissions: ReadonlySet<string>;
			resource: FgacResourceRef;
			schema: FgacSchema;
	  }
	| {
			kind: 'allPermissions';
			permissions: ReadonlySet<string>;
			resource: FgacResourceRef;
			schema: FgacSchema;
	  };

function effectivePerms(
	relations: readonly FgacRelationClaim[],
	resource: FgacResourceRef,
	schema: FgacSchema,
): Set<string> {
	const held = relationsHeldOnResource(relations, resource.type, resource.id);
	return effectivePermissionsOnResource({
		schema,
		resourceType: resource.type,
		relationNamesHeld: held,
	});
}

export function satisfiesRequirement(
	fgacClaims: readonly FgacRelationClaim[],
	requirement: PermissionRequirement,
): boolean {
	switch (requirement.kind) {
		case 'relation': {
			for (const r of fgacClaims) {
				if (r.resource_type !== requirement.resource.type) {
					continue;
				}
				if (r.relation !== requirement.relation) {
					continue;
				}
				if (r.resource_id !== requirement.resource.id && r.resource_id !== '*') {
					continue;
				}
				return true;
			}
			return false;
		}
		case 'anyRelation': {
			for (const rel of requirement.relations) {
				for (const r of fgacClaims) {
					if (r.resource_type !== requirement.resource.type) {
						continue;
					}
					if (r.relation !== rel) {
						continue;
					}
					if (r.resource_id !== requirement.resource.id && r.resource_id !== '*') {
						continue;
					}
					return true;
				}
			}
			return false;
		}
		case 'allRelations': {
			for (const rel of requirement.relations) {
				let ok = false;
				for (const r of fgacClaims) {
					if (r.resource_type !== requirement.resource.type) {
						continue;
					}
					if (r.relation !== rel) {
						continue;
					}
					if (r.resource_id !== requirement.resource.id && r.resource_id !== '*') {
						continue;
					}
					ok = true;
					break;
				}
				if (!ok) {
					return false;
				}
			}
			return true;
		}
		case 'anyPermission': {
			const eff = effectivePerms(fgacClaims, requirement.resource, requirement.schema);
			for (const p of requirement.permissions) {
				if (eff.has(p)) {
					return true;
				}
			}
			return false;
		}
		case 'allPermissions': {
			const eff = effectivePerms(fgacClaims, requirement.resource, requirement.schema);
			for (const p of requirement.permissions) {
				if (!eff.has(p)) {
					return false;
				}
			}
			return true;
		}
	}
}
