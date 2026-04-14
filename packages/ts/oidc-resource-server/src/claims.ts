import { z } from 'zod';

export const fgacRelationEntrySchema = z.object({
	resource_type: z.string(),
	resource_id: z.string(),
	relation: z.string(),
});

export type FgacRelationClaim = z.infer<typeof fgacRelationEntrySchema>;

export const fgacPermissionEntrySchema = z.object({
	resource_type: z.string(),
	resource_id: z.string(),
	permissions: z.array(z.string()),
});

export type FgacPermissionClaim = z.infer<typeof fgacPermissionEntrySchema>;

const realmAccessSchema = z.object({
	roles: z.array(z.string()),
});

const resourceAccessEntrySchema = z.object({
	roles: z.array(z.string()),
});

export function parseScopeClaim(scope: unknown): Set<string> {
	if (typeof scope !== 'string' || scope.trim().length === 0) {
		return new Set();
	}
	return new Set(scope.trim().split(/\s+/).filter(Boolean));
}

export function parseRealmRoles(claims: Record<string, unknown>): string[] {
	const raw = claims['realm_access'];
	const parsed = realmAccessSchema.safeParse(raw);
	if (!parsed.success) {
		return [];
	}
	return parsed.data.roles;
}

export function parseResourceAccess(claims: Record<string, unknown>): ReadonlyMap<string, readonly string[]> {
	const raw = claims['resource_access'];
	if (typeof raw !== 'object' || raw === null) {
		return new Map();
	}
	const out = new Map<string, readonly string[]>();
	for (const [k, v] of Object.entries(raw)) {
		const p = resourceAccessEntrySchema.safeParse(v);
		if (p.success) {
			out.set(k, p.data.roles);
		}
	}
	return out;
}

export function parseFgacRelations(claims: Record<string, unknown>): readonly FgacRelationClaim[] {
	const raw = claims['fgac_relations'];
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: FgacRelationClaim[] = [];
	for (const item of raw) {
		const p = fgacRelationEntrySchema.safeParse(item);
		if (p.success) {
			out.push(p.data);
		}
	}
	return out;
}

export function parseFgacPermissions(claims: Record<string, unknown>): readonly FgacPermissionClaim[] {
	const raw = claims['fgac_permissions'];
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: FgacPermissionClaim[] = [];
	for (const item of raw) {
		const p = fgacPermissionEntrySchema.safeParse(item);
		if (!p.success) {
			continue;
		}
		out.push({
			resource_type: p.data.resource_type,
			resource_id: p.data.resource_id,
			permissions: Array.from(new Set(p.data.permissions)),
		});
	}
	return out;
}

export function parseFgacTruncated(claims: Record<string, unknown>): boolean {
	return claims['fgac_truncated'] === true;
}

export function matchesFgacGrant(
	relations: readonly FgacRelationClaim[],
	resourceType: string,
	resourceId: string,
	relation?: string,
): boolean {
	for (const r of relations) {
		if (r.resource_type !== resourceType) {
			continue;
		}
		if (relation !== undefined && r.relation !== relation) {
			continue;
		}
		if (r.resource_id !== resourceId && r.resource_id !== '*') {
			continue;
		}
		return true;
	}
	return false;
}

export function relationsHeldOnResource(
	relations: readonly FgacRelationClaim[],
	resourceType: string,
	resourceId: string,
): Set<string> {
	const names = new Set<string>();
	for (const r of relations) {
		if (r.resource_type !== resourceType) {
			continue;
		}
		if (r.resource_id !== resourceId && r.resource_id !== '*') {
			continue;
		}
		names.add(r.relation);
	}
	return names;
}

export function hasFgacPermission(
	permissions: readonly FgacPermissionClaim[],
	resourceType: string,
	resourceId: string,
	permission: string,
): boolean {
	for (const entry of permissions) {
		if (entry.resource_type !== resourceType) {
			continue;
		}
		if (entry.resource_id !== resourceId && entry.resource_id !== '*') {
			continue;
		}
		if (entry.permissions.includes(permission)) {
			return true;
		}
	}
	return false;
}
