import { ORPCError } from '@orpc/server';
import z from 'zod';
import type { Subject } from '../fgac/adapters/IPermissionAdapter';
import type { PermissionServiceEnv } from '../fgac/services/permission-service.factory';
import {
	addToGroupDto,
	batchCheckPermissionsDto,
	batchCheckResultDto,
	batchGrantDto,
	batchRevokeDto,
	checkPermissionDto,
	checkRelationDto,
	checkResultDto,
	defineRelationDto,
	deleteRelationDto,
	getAllPermissionsDto,
	getAllPermissionsResponseDto,
	getGroupMembersResponseDto,
	getGroupRelationsResponseDto,
	getUserRelationsResponseDto,
	grantRelationDto,
	listGroupsResponseDto,
	listRelationsResponseDto,
	permissionCheckResultDto,
	relationCheckResultDto,
	removeFromGroupDto,
	revokeRelationDto,
	successResponseDto,
} from '../fgac/routes/dto/permissions.dto';
import {
	createPermissionManagementService,
	createPermissionService,
} from '../fgac/services/permission-service.factory';
import { publicProcedure } from '../../procedure';
import { getTRPCContext, type TRPCContext } from '../../core/context';
import { extractAndVerifyToken, validateUser } from '../../core/utils/auth';
import { getAuthTokenFromRequest } from '../auth/session';
import {
	addRedirectUriDto,
	addScopeToSetDto,
	attachScopeSetDto,
	clientIdParamsDto,
	createClientDto,
	createProjectApiKeyDto,
	createProjectDto,
	createScopeSetDto,
	detachScopeSetDto,
	inviteMemberDto,
	projectApiKeyIdParamsDto,
	projectParamsDto,
	PROJECT_API_KEY_PREFIX,
	removeMemberDto,
	removeRedirectUriDto,
	removeScopeFromSetDto,
	revokeInviteDto,
	scopeSetIdParamsDto,
	updateClientDto,
	updateMemberRoleDto,
	updateProjectDto,
	updateScopeSetDto,
	type ProjectRole,
} from './dto';
import { ProjectsService } from './service';
import {
	buildProjectFgacConfig,
	listMergedFgacDocTypes,
	PROJECT_FGAC_PERMISSIONS,
	PROJECT_FGAC_RELATIONS,
	SYSTEM_FGAC_DOC_TYPES,
} from '../permissions/project-fgac';

const OPENAPI_TAG = 'Projects';
const PERMISSION_TAG = 'Project Permissions';

const fgacDocTypeNameDto = z.object({
	name: z.string().min(1).max(64),
});

const mergedFgacDocTypesResponseDto = z.object({
	ok: z.literal(true),
	mergedDocTypes: z.array(z.string()),
});

const READ_FGAC_SCHEMA_SCOPE = 'read_fgac_schema';

const fgacIntegrationSchemaResponseDto = z.object({
	projectSlug: z.string(),
	fgacDocTypes: z.object({
		system: z.array(z.string()),
		custom: z.array(z.string()),
		merged: z.array(z.string()),
	}),
	relationsByDocType: z.record(z.string(), listRelationsResponseDto),
});

const projectApiKeyListItemDto = z.object({
	id: z.string(),
	name: z.string(),
	keyPrefix: z.string(),
	scopes: z.array(z.string()),
	revokedAt: z.date().nullable(),
	lastUsedAt: z.date().nullable(),
	createdAt: z.date(),
});

const createProjectApiKeyResponseDto = z.object({
	id: z.string(),
	keyPrefix: z.string(),
	apiKey: z.string(),
	scopes: z.array(z.string()),
});

export type SessionAuthedContext = {
	ctx: TRPCContext;
	user: Awaited<ReturnType<typeof validateUser>>;
	isSuperAdmin: boolean;
	projectsService: ProjectsService;
};

type AuthedContext = SessionAuthedContext;

export async function requireSessionUser(context: unknown): Promise<SessionAuthedContext> {
	return requireAuthenticated(context);
}

export function assertSystemAdminAccess(ctx: TRPCContext, userId: string): void {
	const configured = (ctx.env.SYSTEM_ADMIN_USER_ID ?? '').trim();
	if (configured.length > 0 && configured !== userId) {
		throw new ORPCError('FORBIDDEN', { message: 'System admin access required' });
	}
}

async function requireAuthenticated(context: unknown): Promise<AuthedContext> {
	const ctx = getTRPCContext(context);
	const token = getAuthTokenFromRequest(ctx.c);
	if (!token) {
		throw new ORPCError('UNAUTHORIZED', { message: 'Missing session token' });
	}

	const payload = await extractAndVerifyToken(token, ctx.env.JWT_SECRET ?? '');
	const user = await validateUser(ctx, payload.userId);
	ctx.c.set('user', user);

	return {
		ctx,
		user,
		isSuperAdmin: (ctx.env.SYSTEM_ADMIN_USER_ID ?? '').trim() === user.id,
		projectsService: new ProjectsService(ctx.get('db'), ctx.env),
	};
}

async function requireProjectAccess(
	context: unknown,
	slug: string,
	minRole: ProjectRole = 'viewer',
) {
	const authed = await requireAuthenticated(context);
	const access = await authed.projectsService.getProjectAccess(
		slug,
		authed.user.id,
		authed.isSuperAdmin,
		minRole,
	);
	return {
		...authed,
		project: access.project,
		projectRole: access.role,
	};
}

type ProjectFgacRow = {
	id: string;
	fgacCustomDocTypes: string[] | null;
};

function getPermissionServices(ctx: TRPCContext, project: ProjectFgacRow) {
	const config = buildProjectFgacConfig(project.id, project.fgacCustomDocTypes ?? []);
	const env = ctx.env as unknown as PermissionServiceEnv<typeof config>;

	return {
		config,
		management: createPermissionManagementService(env, config),
		checker: createPermissionService(env, config),
	};
}

function validateDocType(type: string, project: ProjectFgacRow) {
	const allowed = listMergedFgacDocTypes(project.fgacCustomDocTypes);
	if (!allowed.includes(type)) {
		throw new ORPCError('BAD_REQUEST', {
			message: `Invalid doc type. Supported: ${allowed.join(', ')}`,
		});
	}
	return type;
}

function validateRelationName(relation: string): (typeof PROJECT_FGAC_RELATIONS)[number] {
	const t = relation.trim();
	if (t.length === 0) {
		throw new ORPCError('BAD_REQUEST', { message: 'Relation name is required' });
	}
	if (t.length > 128) {
		throw new ORPCError('BAD_REQUEST', { message: 'Relation name is too long' });
	}
	if (!(PROJECT_FGAC_RELATIONS as readonly string[]).includes(t)) {
		throw new ORPCError('BAD_REQUEST', {
			message: `Invalid relation. Supported: ${PROJECT_FGAC_RELATIONS.join(', ')}`,
		});
	}
	return t as (typeof PROJECT_FGAC_RELATIONS)[number];
}

function validatePermission(permission: string) {
	if (!PROJECT_FGAC_PERMISSIONS.includes(permission as (typeof PROJECT_FGAC_PERMISSIONS)[number])) {
		throw new ORPCError('BAD_REQUEST', {
			message: `Invalid permission. Supported: ${PROJECT_FGAC_PERMISSIONS.join(', ')}`,
		});
	}
	return permission as (typeof PROJECT_FGAC_PERMISSIONS)[number];
}

async function requireIntegrationApiKey(
	context: unknown,
	slug: string,
): Promise<{ ctx: TRPCContext; project: ProjectFgacRow }> {
	const ctx = getTRPCContext(context);
	const token = getAuthTokenFromRequest(ctx.c);
	if (!token?.startsWith(PROJECT_API_KEY_PREFIX)) {
		throw new ORPCError('UNAUTHORIZED', {
			message: 'Project API key required: Authorization Bearer oidcproj_…',
		});
	}
	const svc = new ProjectsService(ctx.get('db'), ctx.env);
	const validated = await svc.validateProjectApiKey(token);
	if (!validated) {
		throw new ORPCError('UNAUTHORIZED', {
			message: 'Invalid or revoked project API key',
		});
	}
	const project = await svc.assertProjectSlugMatchesId(slug, validated.projectId);
	if (!validated.scopes.includes(READ_FGAC_SCHEMA_SCOPE)) {
		throw new ORPCError('FORBIDDEN', {
			message: `API key must include scope: ${READ_FGAC_SCHEMA_SCOPE}`,
		});
	}
	return { ctx, project };
}

export const projectRoutes = {
	createProject: publicProcedure
		.route({
			method: 'POST',
			path: '/projects',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ body: createProjectDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, user } = await requireAuthenticated(context);
			return projectsService.createProject({
				...input.body,
				createdByUserId: user.id,
			});
		}),

	listProjects: publicProcedure
		.route({
			method: 'GET',
			path: '/projects',
			tags: [OPENAPI_TAG],
		})
		.handler(async ({ context }) => {
			const { projectsService, user, isSuperAdmin } = await requireAuthenticated(context);
			return projectsService.listProjects(user.id, isSuperAdmin);
		}),

	getProject: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { project, projectRole } = await requireProjectAccess(context, input.params.slug, 'viewer');
			return {
				...project,
				role: projectRole,
				fgacDocTypes: {
					system: [...SYSTEM_FGAC_DOC_TYPES],
					custom: project.fgacCustomDocTypes ?? [],
					merged: listMergedFgacDocTypes(project.fgacCustomDocTypes),
				},
			};
		}),

	updateProject: publicProcedure
		.route({
			method: 'PATCH',
			path: '/projects/:slug',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: updateProjectDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.updateProject(project.id, input.body);
		}),

	deactivateProject: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/deactivate',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.updateProject(project.id, { isActive: false });
		}),

	inviteMember: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/invitations',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: inviteMemberDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project, user } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.inviteMember({
				projectId: project.id,
				email: input.body.email,
				role: input.body.role,
				invitedByUserId: user.id,
			});
		}),

	listInvitations: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/invitations',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.listInvitations(project.id);
		}),

	revokeInvitation: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/invitations',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: revokeInviteDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.revokeInvitation(project.id, input.body.invitationId);
		}),

	listMembers: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/members',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			return projectsService.listMembers(project.id);
		}),

	updateMemberRole: publicProcedure
		.route({
			method: 'PATCH',
			path: '/projects/:slug/members',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: updateMemberRoleDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project, user } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.updateMemberRole(project.id, input.body.userId, input.body.role, user.id);
		}),

	removeMember: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/members',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: removeMemberDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.removeMember(project.id, input.body.userId);
		}),

	createScopeSet: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/scope-sets',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: createScopeSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project, user } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.createScopeSet(project.id, input.body, user.id);
		}),

	listScopeSets: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/scope-sets',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			return projectsService.listScopeSets(project.id);
		}),

	updateScopeSet: publicProcedure
		.route({
			method: 'PATCH',
			path: '/projects/:slug/scope-sets/:scopeSetId',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: scopeSetIdParamsDto, body: updateScopeSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.updateScopeSet(project.id, input.params.scopeSetId, input.body);
		}),

	deactivateScopeSet: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/scope-sets/:scopeSetId/deactivate',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: scopeSetIdParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.updateScopeSet(project.id, input.params.scopeSetId, { isActive: false });
		}),

	addScopeToSet: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/scope-sets/:scopeSetId/scopes',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: scopeSetIdParamsDto, body: addScopeToSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.addScopeToSet(project.id, input.params.scopeSetId, input.body.scope);
		}),

	removeScopeFromSet: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/scope-sets/:scopeSetId/scopes',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: scopeSetIdParamsDto, body: removeScopeFromSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.removeScopeFromSet(project.id, input.params.scopeSetId, input.body.scope);
		}),

	createClient: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/clients',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: createClientDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project, user } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.createClient(project.id, input.body, user.id);
		}),

	listClients: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/clients',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			return projectsService.listClients(project.id);
		}),

	updateClient: publicProcedure
		.route({
			method: 'PATCH',
			path: '/projects/:slug/clients/:clientId',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto, body: updateClientDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.updateClient(project.id, input.params.clientId, input.body);
		}),

	deactivateClient: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/clients/:clientId/deactivate',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.updateClient(project.id, input.params.clientId, { isActive: false });
		}),

	rotateClientSecret: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/clients/:clientId/rotate-secret',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.rotateClientSecret(project.id, input.params.clientId);
		}),

	addClientRedirectUri: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/clients/:clientId/callbacks',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto, body: addRedirectUriDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.addClientRedirectUri(
				project.id,
				input.params.clientId,
				input.body.redirectUri,
			);
		}),

	removeClientRedirectUri: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/clients/:clientId/callbacks',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto, body: removeRedirectUriDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.removeClientRedirectUri(
				project.id,
				input.params.clientId,
				input.body.redirectUri,
			);
		}),

	attachClientScopeSet: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/clients/:clientId/scope-sets',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto, body: attachScopeSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.attachScopeSetToClient(
				project.id,
				input.params.clientId,
				input.body.scopeSetId,
			);
		}),

	detachClientScopeSet: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/clients/:clientId/scope-sets',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: clientIdParamsDto, body: detachScopeSetDto }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'editor');
			return projectsService.detachScopeSetFromClient(
				project.id,
				input.params.clientId,
				input.body.scopeSetId,
			);
		}),

	defineProjectRelation: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/relations/define',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: defineRelationDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.defineRelation({
				type: validateDocType(input.body.type, project),
				relation: input.body.relation,
				permissions: input.body.permissions.map(validatePermission),
				inherits: input.body.inherits,
			});
		}),

	deleteProjectRelation: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/permissions/relations',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: deleteRelationDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.deleteRelation(validateDocType(input.body.type, project), input.body.relation);
		}),

	addProjectFgacDocType: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/doc-types',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: fgacDocTypeNameDto }))
		.output(mergedFgacDocTypesResponseDto)
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.addFgacCustomDocType(project.id, input.body.name);
		}),

	removeProjectFgacDocType: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/permissions/doc-types',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: fgacDocTypeNameDto }))
		.output(mergedFgacDocTypesResponseDto)
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.removeFgacCustomDocType(project.id, input.body.name);
		}),

	listProjectRelations: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/relations/:type',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({
			params: z.object({
				slug: z.string().min(2),
				type: z.string().min(1),
			}),
		}))
		.output(listRelationsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { management } = getPermissionServices(ctx, project);
			return management.listRelations(validateDocType(input.params.type, project));
		}),

	grantProjectRelation: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/grants',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: grantRelationDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.grant(
				input.body.subject as Subject,
				validateRelationName(input.body.relation),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.expiresAt,
			);
		}),

	revokeProjectRelation: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/permissions/grants',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: revokeRelationDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.revoke(
				input.body.subject as Subject,
				validateRelationName(input.body.relation),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
			);
		}),

	batchGrantProjectRelations: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/grants/batch',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: batchGrantDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.grantToResources(
				input.body.subject as Subject,
				validateRelationName(input.body.relation),
				input.body.resources.map((resource) => ({
					type: validateDocType(resource.type, project),
					id: resource.id,
				})),
				input.body.expiresAt,
			);
		}),

	batchRevokeProjectRelations: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/permissions/grants/batch',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: batchRevokeDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.revokeFromResources(
				input.body.subject as Subject,
				validateRelationName(input.body.relation),
				input.body.resources.map((resource) => ({
					type: validateDocType(resource.type, project),
					id: resource.id,
				})),
			);
		}),

	getProjectUserRelations: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/users/:userId/relations/:type',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({
			params: z.object({
				slug: z.string().min(2),
				userId: z.string().min(1),
				type: z.string().min(1),
			}),
		}))
		.output(getUserRelationsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.getUserRelations(input.params.userId, validateDocType(input.params.type, project));
		}),

	getMyProjectRelations: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/me/relations/:type',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({
			params: z.object({
				slug: z.string().min(2),
				type: z.string().min(1),
			}),
		}))
		.output(getUserRelationsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { management } = getPermissionServices(ctx, project);
			return management.getUserRelations(user.id, validateDocType(input.params.type, project));
		}),

	addProjectUserToGroup: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/groups/members',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: addToGroupDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.addToGroup(input.body.user, input.body.group);
		}),

	removeProjectUserFromGroup: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/permissions/groups/members',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: removeFromGroupDto }))
		.output(successResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			const { management } = getPermissionServices(ctx, project);
			return management.removeFromGroup(input.body.user, input.body.group);
		}),

	listProjectGroups: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/groups',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.output(listGroupsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { management } = getPermissionServices(ctx, project);
			return management.listGroups();
		}),

	getProjectGroupMembers: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/groups/:group/members',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({
			params: z.object({
				slug: z.string().min(2),
				group: z.string().min(1),
			}),
		}))
		.output(getGroupMembersResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { management } = getPermissionServices(ctx, project);
			return management.getGroupMembers(input.params.group);
		}),

	getProjectGroupRelations: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/permissions/groups/:group/relations',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({
			params: z.object({
				slug: z.string().min(2),
				group: z.string().min(1),
			}),
		}))
		.output(getGroupRelationsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { management } = getPermissionServices(ctx, project);
			return management.getGroupRelations(input.params.group);
		}),

	checkProjectPermission: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/check/permission',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: checkPermissionDto }))
		.output(permissionCheckResultDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			return checker.checkPermission(
				user.id,
				validatePermission(input.body.permission),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
		}),

	checkProjectRelation: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/check/relation',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: checkRelationDto }))
		.output(relationCheckResultDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			return checker.checkRelation(
				user.id,
				validateRelationName(input.body.relation),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
		}),

	checkProjectCan: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/can',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: checkPermissionDto }))
		.output(checkResultDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			const allowed = await checker.can(
				user.id,
				validatePermission(input.body.permission),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
			return { allowed };
		}),

	checkProjectCanAll: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/can/all',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: batchCheckPermissionsDto }))
		.output(batchCheckResultDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			return checker.canAll(
				user.id,
				input.body.permissions.map(validatePermission),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
		}),

	checkProjectCanAny: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/can/any',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: batchCheckPermissionsDto }))
		.output(checkResultDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			const allowed = await checker.canAny(
				user.id,
				input.body.permissions.map(validatePermission),
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
			return { allowed };
		}),

	getProjectAllPermissions: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/permissions/all',
			tags: [PERMISSION_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: getAllPermissionsDto }))
		.output(getAllPermissionsResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project, user } = await requireProjectAccess(context, input.params.slug, 'viewer');
			const { checker } = getPermissionServices(ctx, project);
			return checker.getAllPermissions(
				user.id,
				{
					type: validateDocType(input.body.resource.type, project),
					id: input.body.resource.id,
				},
				input.body.bypassCache,
			);
		}),

	createProjectApiKey: publicProcedure
		.route({
			method: 'POST',
			path: '/projects/:slug/api-keys',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto, body: createProjectApiKeyDto }))
		.output(createProjectApiKeyResponseDto)
		.handler(async ({ input, context }) => {
			const { projectsService, project, user } = await requireProjectAccess(
				context,
				input.params.slug,
				'admin',
			);
			return projectsService.createProjectApiKey(project.id, user.id, {
				name: input.body.name,
				scopes: input.body.scopes,
			});
		}),

	listProjectApiKeys: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/api-keys',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.output(z.array(projectApiKeyListItemDto))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.listProjectApiKeys(project.id);
		}),

	revokeProjectApiKey: publicProcedure
		.route({
			method: 'DELETE',
			path: '/projects/:slug/api-keys/:keyId',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectApiKeyIdParamsDto }))
		.output(z.object({ ok: z.literal(true) }))
		.handler(async ({ input, context }) => {
			const { projectsService, project } = await requireProjectAccess(context, input.params.slug, 'admin');
			return projectsService.revokeProjectApiKey(project.id, input.params.keyId);
		}),

	getProjectFgacIntegrationSchema: publicProcedure
		.route({
			method: 'GET',
			path: '/projects/:slug/integration/fgac-schema',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(z.object({ params: projectParamsDto }))
		.output(fgacIntegrationSchemaResponseDto)
		.handler(async ({ input, context }) => {
			const { ctx, project } = await requireIntegrationApiKey(context, input.params.slug);
			const { config, management } = getPermissionServices(ctx, project);
			const merged = listMergedFgacDocTypes(project.fgacCustomDocTypes);
			const relationsByDocType: Record<string, z.infer<typeof listRelationsResponseDto>> = {};
			for (const docType of merged) {
				const typed = validateDocType(docType, project);
				relationsByDocType[docType] = await management.listRelations(
					typed as (typeof config.docTypes)[number],
				);
			}
			return {
				projectSlug: input.params.slug,
				fgacDocTypes: {
					system: [...SYSTEM_FGAC_DOC_TYPES],
					custom: project.fgacCustomDocTypes ?? [],
					merged,
				},
				relationsByDocType,
			};
		}),
};
