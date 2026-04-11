export const SYSTEM_FGAC_DOC_TYPES = ['project', 'client', 'scope_set', 'user'] as const;
export const PROJECT_FGAC_DOC_TYPES = SYSTEM_FGAC_DOC_TYPES;
export const PROJECT_FGAC_RELATIONS = ['viewer', 'editor', 'owner', 'member', 'admin'] as const;
export const PROJECT_FGAC_PERMISSIONS = [
	'user',
	'read',
	'write',
	'admin',
	'superadmin',
	'manage_permissions',
] as const;

export function normalizeFgacCustomDocTypeName(raw: string): string | null {
	const t = raw.trim().toLowerCase();
	if (t.length === 0 || t.length > 64) return null;
	if (!/^[a-z][a-z0-9_]*$/.test(t)) return null;
	return t;
}

export function mergeCustomFgacDocTypes(custom: readonly string[] | null | undefined): string[] {
	const system = new Set<string>(SYSTEM_FGAC_DOC_TYPES);
	const out: string[] = [];
	const seen = new Set<string>(system);
	for (const raw of custom ?? []) {
		const n = normalizeFgacCustomDocTypeName(raw);
		if (!n || seen.has(n) || system.has(n)) continue;
		seen.add(n);
		out.push(n);
	}
	return out;
}

export function listMergedFgacDocTypes(custom: readonly string[] | null | undefined): string[] {
	return [...SYSTEM_FGAC_DOC_TYPES, ...mergeCustomFgacDocTypes(custom)];
}

export function buildProjectFgacConfig(projectId: string, customDocTypes: readonly string[] | null | undefined = []) {
	const extra = mergeCustomFgacDocTypes(customDocTypes);
	const docTypes = [...SYSTEM_FGAC_DOC_TYPES, ...extra] as unknown as [
		string,
		...string[],
	];
	return {
		docTypes,
		relations: PROJECT_FGAC_RELATIONS as unknown as readonly [string, ...string[]],
		permissions: PROJECT_FGAC_PERMISSIONS,
		projectId,
		defaultRelations: {
			viewer: { permissions: ['read'] as const, inherits: [] as const },
			editor: { permissions: ['write'] as const, inherits: ['viewer'] as const },
			member: { permissions: ['user'] as const, inherits: [] as const },
			owner: {
				permissions: ['admin', 'manage_permissions'] as const,
				inherits: ['editor'] as const,
			},
			admin: {
				permissions: ['admin', 'superadmin', 'manage_permissions'] as const,
				inherits: ['owner'] as const,
			},
		} as const,
		autoGrantAdminToSystemAdmin: true,
	};
}

export type ProjectFgacConfig = ReturnType<typeof buildProjectFgacConfig>;
