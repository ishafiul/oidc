/**
 * Permission Routes
 *
 * API routes for permission management, checking, and group operations.
 */

import z from 'zod';
import { ORPCError, type Context, type ErrorMap, type Meta, type ProcedureBuilder } from '@orpc/server';
import type { PermissionContext, ProcedurePermissions } from '../procedure-types';
import { type AnySchema } from '@orpc/contract';
import type {
    FGACConfig,
    InferDocType,
    InferPermission,
    InferRelation,
    Resource,
    Subject,
} from '../adapters/IPermissionAdapter';
import {
    createPermissionManagementService,
    createPermissionService,
    type PermissionServiceEnv,
} from '../services/permission-service.factory';
import {
    defineRelationDto,
    deleteRelationDto,
    grantRelationDto,
    revokeRelationDto,
    batchGrantDto,
    batchRevokeDto,
    getUserRelationsDto,
    addToGroupDto,
    removeFromGroupDto,
    getGroupMembersDto,
    getGroupRelationsDto,
    checkPermissionDto,
    checkRelationDto,
    batchCheckPermissionsDto,
    getAllPermissionsDto,
    successResponseDto,
    listRelationsResponseDto,
    getUserRelationsResponseDto,
    listGroupsResponseDto,
    getGroupMembersResponseDto,
    getGroupRelationsResponseDto,
    checkResultDto,
    permissionCheckResultDto,
    relationCheckResultDto,
    batchCheckResultDto,
    getAllPermissionsResponseDto,
} from './dto/permissions.dto';

const OPENAPI_TAG = 'Permissions';

export interface PermissionRoutesConfig<
    TConfig extends FGACConfig,
    TInitialContext extends Context = Context,
    TCurrentContext extends Context = Context,
    TMeta extends Meta = Meta,
    TPermissionContext extends PermissionContext<TConfig> = PermissionContext<TConfig>
> {
    protectedProcedure: (permissions: ProcedurePermissions<TConfig>) => ProcedureBuilder<TInitialContext, TCurrentContext, AnySchema, AnySchema, ErrorMap, TMeta>;
    getContext: (context: TCurrentContext) => TPermissionContext & { env: PermissionServiceEnv<TConfig> };
    config: TConfig;
}

/**
 * Create permission routes with the given configuration.
 * Uses a generic approach to preserve full type safety of procedures.
 */
export function createPermissionRoutes<
    TConfig extends FGACConfig,
    TInitialContext extends Context = Context,
    TCurrentContext extends Context = Context,
    TMeta extends Meta = Meta
>(
    routeConfig: PermissionRoutesConfig<TConfig, TInitialContext, TCurrentContext, TMeta>
) {
    const { protectedProcedure, getContext, config } = routeConfig;

    // Validation helper
    const validateDocType = (type: string): InferDocType<TConfig> => {
        if (!(config.docTypes as readonly string[]).includes(type)) {
            throw new ORPCError('BAD_REQUEST', {
                message: `Invalid resource type. Expected one of: ${config.docTypes.join(', ')}`,
            });
        }
        return type as InferDocType<TConfig>;
    };

    const validateRelation = (relation: string): InferRelation<TConfig> => {
        if (!(config.relations as readonly string[]).includes(relation)) {
            throw new ORPCError('BAD_REQUEST', {
                message: `Invalid relation. Expected one of: ${config.relations.join(', ')}`,
            });
        }
        return relation as InferRelation<TConfig>;
    };

    const validatePermission = (permission: string): InferPermission<TConfig> => {
        if (!(config.permissions as readonly string[]).includes(permission)) {
            throw new ORPCError('BAD_REQUEST', {
                message: `Invalid permission. Expected one of: ${config.permissions.join(', ')}`,
            });
        }
        return permission as InferPermission<TConfig>;
    };

    const validatePermissions = (permissions: string[]): InferPermission<TConfig>[] => {
        return permissions.map(validatePermission);
    };

    const getAuthenticatedUserId = (
        ctx: ReturnType<typeof getContext>
    ): string => {
        const authUser = ctx.get('user') as { id?: string } | undefined;
        if (!authUser?.id) {
            throw new ORPCError('UNAUTHORIZED', { message: 'Not authenticated' });
        }
        return authUser.id;
    };

    return {
        // ============================================
        // Relation Definition Routes
        // ============================================

        defineRelation: protectedProcedure({ allOf: ['superadmin'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/relations/define',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: defineRelationDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const type = validateDocType(input.body.type);
                const permissions = validatePermissions(input.body.permissions);
                return service.defineRelation({
                    type,
                    relation: input.body.relation,
                    permissions,
                    inherits: input.body.inherits,
                });
            }),

        deleteRelation: protectedProcedure({ allOf: ['superadmin'], resourceType: config.docTypes[0] })
            .route({
                method: 'DELETE',
                path: '/permissions/relations',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: deleteRelationDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const type = validateDocType(input.body.type);
                return service.deleteRelation(type, input.body.relation);
            }),

        listRelations: protectedProcedure({ anyOf: ['read'], resourceType: config.docTypes[0] })
            .route({
                method: 'GET',
                path: '/permissions/relations/:type',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({ params: z.object({ type: z.string() }) }))
            .output(listRelationsResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const type = validateDocType(input.params.type);
                return service.listRelations(type);
            }),

        // ============================================
        // Grant/Revoke Routes
        // ============================================

        grantRelation: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({ method: 'POST', path: '/permissions/grants', tags: [OPENAPI_TAG], inputStructure: 'detailed' })
            .input(z.object({
                body: grantRelationDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const relation = validateRelation(input.body.relation);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.grant(input.body.subject as Subject, relation, resource, input.body.expiresAt);
            }),

        revokeRelation: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({ method: 'DELETE', path: '/permissions/grants', tags: [OPENAPI_TAG], inputStructure: 'detailed' })
            .input(z.object({
                body: revokeRelationDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const relation = validateRelation(input.body.relation);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.revoke(input.body.subject as Subject, relation, resource);
            }),

        batchGrant: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/grants/batch',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: batchGrantDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const relation = validateRelation(input.body.relation);
                const resources = input.body.resources.map((r) => {
                    const type = validateDocType(r.type);
                    return { type, id: r.id } as Resource<InferDocType<TConfig>>;
                });
                return service.grantToResources(input.body.subject as Subject, relation, resources, input.body.expiresAt);
            }),

        batchRevoke: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'DELETE',
                path: '/permissions/grants/batch',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: batchRevokeDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const relation = validateRelation(input.body.relation);
                const resources = input.body.resources.map((r) => {
                    const type = validateDocType(r.type);
                    return { type, id: r.id } as Resource<InferDocType<TConfig>>;
                });
                return service.revokeFromResources(input.body.subject as Subject, relation, resources);
            }),

        // ============================================
        // User Relation Routes
        // ============================================

        getUserRelations: protectedProcedure({ anyOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'GET',
                path: '/permissions/users/:userId/relations/:type',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                params: getUserRelationsDto
            }))
            .output(getUserRelationsResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                const type = validateDocType(input.params.type);
                return service.getUserRelations(input.params.userId, type);
            }),

        getMyRelations: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'GET',
                path: '/permissions/me/relations/:type',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                params: z.object({ type: z.string() })
            }))
            .output(getUserRelationsResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionManagementService(ctx.env, config);
                const type = validateDocType(input.params.type);
                return service.getUserRelations(userId, type);
            }),

        // ============================================
        // Group Management Routes
        // ============================================

        addToGroup: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/groups/members',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: addToGroupDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return service.addToGroup(input.body.user, input.body.group);
            }),

        removeFromGroup: protectedProcedure({ allOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'DELETE',
                path: '/permissions/groups/members',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: removeFromGroupDto
            }))
            .output(successResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return service.removeFromGroup(input.body.user, input.body.group);
            }),

        listGroups: protectedProcedure({ anyOf: ['admin'], resourceType: config.docTypes[0] })
            .route({ method: 'GET', path: '/permissions/groups', tags: [OPENAPI_TAG] })
            .output(listGroupsResponseDto)
            .handler(async ({ context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return service.listGroups();
            }),

        getGroupMembers: protectedProcedure({ anyOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'GET',
                path: '/permissions/groups/:group/members',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                params: getGroupMembersDto
            }))
            .output(getGroupMembersResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return service.getGroupMembers(input.params.group);
            }),

        getGroupRelations: protectedProcedure({ anyOf: ['admin'], resourceType: config.docTypes[0] })
            .route({
                method: 'GET',
                path: '/permissions/groups/:group/relations',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                params: z.object({ group: z.string() })
            }))
            .output(getGroupRelationsResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return service.getGroupRelations(input.params.group);
            }),

        // ============================================
        // Permission Check Routes
        // ============================================

        checkPermission: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/check/permission',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: checkPermissionDto
            }))
            .output(permissionCheckResultDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const permission = validatePermission(input.body.permission);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.checkPermission(userId, permission, resource, input.body.bypassCache);
            }),

        checkRelation: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/check/relation',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: checkRelationDto
            }))
            .output(relationCheckResultDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const relation = validateRelation(input.body.relation);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.checkRelation(userId, relation, resource, input.body.bypassCache);
            }),

        can: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/can',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: checkPermissionDto
            }))
            .output(checkResultDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const permission = validatePermission(input.body.permission);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                const allowed = await service.can(userId, permission, resource, input.body.bypassCache);
                return { allowed };
            }),

        canAll: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/can/all',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: batchCheckPermissionsDto
            }))
            .output(batchCheckResultDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const permissions = validatePermissions(input.body.permissions);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.canAll(userId, permissions, resource, input.body.bypassCache);
            }),

        canAny: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/can/any',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: batchCheckPermissionsDto
            }))
            .output(checkResultDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const permissions = validatePermissions(input.body.permissions);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                const allowed = await service.canAny(userId, permissions, resource, input.body.bypassCache);
                return { allowed };
            }),

        getAllPermissions: protectedProcedure({ anyOf: ['user'], resourceType: config.docTypes[0] })
            .route({
                method: 'POST',
                path: '/permissions/all',
                tags: [OPENAPI_TAG],
                inputStructure: 'detailed'
            })
            .input(z.object({
                body: getAllPermissionsDto
            }))
            .output(getAllPermissionsResponseDto)
            .handler(async ({ input, context }) => {
                const ctx = getContext(context);
                const userId = getAuthenticatedUserId(ctx);
                const service = createPermissionService(ctx.env, config);
                const type = validateDocType(input.body.resource.type);
                const resource: Resource<InferDocType<TConfig>> = { type, id: input.body.resource.id };
                return service.getAllPermissions(userId, resource, input.body.bypassCache);
            }),

        // ============================================
        // Connection Test Route
        // ============================================

        testConnection: protectedProcedure({ anyOf: ['admin'], resourceType: config.docTypes[0] })
            .route({ method: 'GET', path: '/permissions/health', tags: [OPENAPI_TAG] })
            .output(z.object({ ok: z.boolean(), message: z.string(), hasKV: z.boolean() }))
            .handler(async ({ context }) => {
                const ctx = getContext(context);
                const service = createPermissionManagementService(ctx.env, config);
                return await service.testConnection();
            }),
    };
}
