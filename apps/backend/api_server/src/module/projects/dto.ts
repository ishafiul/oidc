import z from 'zod';

export const projectRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const projectParamsDto = z.object({
	slug: z.string().min(2),
});

export const projectIdParamsDto = z.object({
	slug: z.string().min(2),
	projectId: z.string().min(1),
});

export const createProjectDto = z.object({
	name: z.string().min(2).max(120),
	slug: z
		.string()
		.min(2)
		.max(80)
		.regex(/^[a-z0-9-]+$/)
		.optional(),
	description: z.string().max(500).optional().nullable(),
});

export const updateProjectDto = z.object({
	name: z.string().min(2).max(120).optional(),
	description: z.string().max(500).optional().nullable(),
	isActive: z.boolean().optional(),
});

export const inviteMemberDto = z.object({
	email: z.email(),
	role: projectRoleSchema,
});

export const revokeInviteDto = z.object({
	invitationId: z.string().min(1),
});

export const updateMemberRoleDto = z.object({
	userId: z.string().min(1),
	role: projectRoleSchema,
});

export const removeMemberDto = z.object({
	userId: z.string().min(1),
});

export const createScopeSetDto = z.object({
	name: z.string().min(2).max(120),
	description: z.string().max(500).optional().nullable(),
	scopes: z.array(z.string().min(1)).min(1).default(['openid', 'profile', 'email']),
	isDefault: z.boolean().optional(),
});

export const updateScopeSetDto = z.object({
	name: z.string().min(2).max(120).optional(),
	description: z.string().max(500).optional().nullable(),
	isActive: z.boolean().optional(),
});

export const addScopeToSetDto = z.object({
	scope: z.string().min(1),
});

export const removeScopeFromSetDto = z.object({
	scope: z.string().min(1),
});

export const scopeSetIdParamsDto = z.object({
	slug: z.string().min(2),
	scopeSetId: z.string().min(1),
});

export const createClientDto = z.object({
	name: z.string().min(2).max(120),
	clientId: z.string().min(2).max(120).regex(/^[a-zA-Z0-9._-]+$/),
	isPublic: z.boolean().default(true),
	redirectUris: z.array(z.string().url()).min(1),
	scopeSetIds: z.array(z.string().min(1)).optional(),
});

export const updateClientDto = z.object({
	name: z.string().min(2).max(120).optional(),
	isPublic: z.boolean().optional(),
	isActive: z.boolean().optional(),
});

export const clientIdParamsDto = z.object({
	slug: z.string().min(2),
	clientId: z.string().min(1),
});

export const addRedirectUriDto = z.object({
	redirectUri: z.string().url(),
});

export const removeRedirectUriDto = z.object({
	redirectUri: z.string().url(),
});

export const attachScopeSetDto = z.object({
	scopeSetId: z.string().min(1),
});

export const detachScopeSetDto = z.object({
	scopeSetId: z.string().min(1),
});

export const PROJECT_API_KEY_PREFIX = 'oidcproj_' as const;

export const projectApiKeyScopeSchema = z.enum(['read_fgac_schema']);

export const createProjectApiKeyDto = z.object({
	name: z.string().max(120).optional().default(''),
	scopes: z.array(projectApiKeyScopeSchema).min(1),
});

export const projectApiKeyIdParamsDto = z.object({
	slug: z.string().min(2),
	keyId: z.string().min(1),
});
