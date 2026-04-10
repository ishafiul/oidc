/**
 * Cloudflare FGAC Adapter Implementation
 *
 * Adapts the Cloudflare Worker-based FGAC service to the IFGACAdapter interface.
 * This adapter wraps the custom FGAC implementation built on Cloudflare's stack
 * (Workers, KV storage, RPC).
 *
 * Follows SOLID principles:
 * - Single Responsibility: Only responsible for adapting worker service calls
 * - Open/Closed: Implements IFGACAdapter, closed for modification
 * - Liskov Substitution: Can be substituted with any IFGACAdapter implementation
 * - Dependency Inversion: Depends on IFGACAdapter abstraction
 */

import type { Service } from '@cloudflare/workers-types';


import type {
    FGACConfig,
    IFGACAdapter,
    InferDocType,
    InferRelation,
    InferPermission,
    PermissionCheckResult,
    RelationCheckResult,
    DefineRelationParams,
} from './IPermissionAdapter';
import {
    BatchCanCheckResult,
    FGACService,
    GetAllPermissionsResponse,
    GetGroupMembersResponse,
    GetGroupRelationsResponse, GetUserRelationsResponse, ListGroupsResponse, ListRelationsResponse,
    PermissionManager,
    Resource, Subject, SuccessResponse
} from "permission-manager-worker/src";

/**
 * Type helper to extract the proper PermissionManager type from config
 */
type PermissionManagerForConfig<TConfig extends FGACConfig> = PermissionManager<
    TConfig['docTypes'],
    TConfig['relations'],
    TConfig['permissions']
>;

/**
 * Type helper for the FGAC Service binding
 */
type FGACServiceForConfig<TConfig extends FGACConfig> = FGACService<
    TConfig['docTypes'],
    TConfig['relations'],
    TConfig['permissions']
>;

function wireListRelationsResponse<TPermission extends string>(
	raw: ListRelationsResponse<TPermission> | null | undefined,
): ListRelationsResponse<TPermission> {
	const relations: Record<string, { permissions: TPermission[]; inherits: string[] }> = {};
	const src = raw?.relations;
	if (src !== null && src !== undefined && typeof src === 'object' && !Array.isArray(src)) {
		for (const [name, def] of Object.entries(src as Record<string, unknown>)) {
			const node = def as { permissions?: unknown; inherits?: unknown };
			const permissions = Array.isArray(node?.permissions)
				? (node.permissions.map((p) => String(p)) as TPermission[])
				: [];
			const inherits = Array.isArray(node?.inherits) ? node.inherits.map((x) => String(x)) : [];
			relations[name] = { permissions, inherits };
		}
	}
	return { relations };
}

/**
 * Cloudflare FGAC Adapter
 *
 * Wraps the Cloudflare Worker-based FGAC service and provides a clean
 * interface for permission checking and management operations.
 */
class CloudflareFGACAdapter<TConfig extends FGACConfig> implements IFGACAdapter<TConfig> {
    private permissionManager?: PermissionManagerForConfig<TConfig>;
    private readonly serviceBinding: Service<FGACServiceForConfig<TConfig>>;
    private readonly config: TConfig;
    private initPromise?: Promise<void>;

    constructor(
        serviceBinding: Service<FGACServiceForConfig<TConfig>>,
        config: TConfig
    ) {
        this.serviceBinding = serviceBinding;
        this.config = config;
    }

    /**
     * Ensures the permission manager is initialized (lazy initialization)
     */
    private async ensureInitialized(): Promise<PermissionManagerForConfig<TConfig>> {
        if (this.permissionManager) {
            return this.permissionManager;
        }

        if (!this.initPromise) {
            this.initPromise = (async () => {
                try {
                    if (!this.serviceBinding) {
                        throw new Error('Service binding is not available');
                    }
                    const manager = await this.serviceBinding.newPermissionManager({
                        projectId: this.config.projectId,
                        docTypes: this.config.docTypes,
                        relations: this.config.relations,
                        permissions: this.config.permissions,
                    });

                    this.permissionManager = manager as unknown as PermissionManagerForConfig<TConfig>;
                } catch (error) {
                    this.initPromise = undefined;
                    throw error;
                }
            })();
        }

        await this.initPromise;
        return this.permissionManager!;
    }

    // ============================================
    // IConnectionTester Implementation
    // ============================================

    async testConnection(): Promise<{ ok: boolean; message: string; hasKV: boolean }> {
        try {
            return await this.serviceBinding.ping();
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                hasKV: false,
            };
        }
    }

    // ============================================
    // IPermissionChecker Implementation
    // ============================================

    async can(
        userId: string,
        permission: InferPermission<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean> {
        const manager = await this.ensureInitialized();
        return manager.can(userId, permission, resource, bypassCache);
    }

    async has(
        userId: string,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean> {
        const manager = await this.ensureInitialized();
        return manager.has(userId, relation, resource, bypassCache);
    }

    async canAll(
        userId: string,
        permissions: InferPermission<TConfig>[],
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<BatchCanCheckResult<InferPermission<TConfig>>> {
        const manager = await this.ensureInitialized();
        return manager.canAll(userId, permissions, resource, bypassCache);
    }

    async canAny(
        userId: string,
        permissions: InferPermission<TConfig>[],
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean> {
        const manager = await this.ensureInitialized();
        return manager.canAny(userId, permissions, resource, bypassCache);
    }

    async getAllPermissions(
        userId: string,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<GetAllPermissionsResponse<InferPermission<TConfig>>> {
        const manager = await this.ensureInitialized();
        return manager.getAllPermissions(userId, resource, bypassCache);
    }

    async checkPermission(
        userId: string,
        permission: InferPermission<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<PermissionCheckResult<InferPermission<TConfig>>> {
        const manager = await this.ensureInitialized();
        const result = await manager.checkPermission({
            user: userId,
            permission,
            type: resource.type,
            id: resource.id,
            bypassCache,
        });
        return {
            allowed: result.allowed,
            permissions: result.permissions as InferPermission<TConfig>[],
            cached: result.cached,
        };
    }

    async checkRelation(
        userId: string,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<RelationCheckResult<InferRelation<TConfig>>> {
        const manager = await this.ensureInitialized();
        const result = await manager.checkRelation({
            user: userId,
            relation,
            type: resource.type,
            id: resource.id,
            bypassCache,
        });
        return {
            allowed: result.allowed,
            relation: result.relation as InferRelation<TConfig>,
            cached: result.cached,
        };
    }

    // ============================================
    // IRelationDefinitionManager Implementation
    // ============================================

    async defineRelation(params: DefineRelationParams<TConfig>): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.defineRelation({
            type: params.type,
            relation: params.relation,
            permissions: params.permissions,
            inherits: params.inherits ?? [],
        });
    }

    async deleteRelation(
        type: InferDocType<TConfig>,
        relation: string
    ): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.deleteRelation({ type, relation });
    }

    async listRelations(
        type: InferDocType<TConfig>
    ): Promise<ListRelationsResponse<InferPermission<TConfig>>> {
        const manager = await this.ensureInitialized();
        const raw = await manager.listRelations({ type });
        return wireListRelationsResponse<InferPermission<TConfig>>(raw);
    }

    // ============================================
    // IRelationGrantManager Implementation
    // ============================================

    async grant(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        expiresAt?: number | null
    ): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.grant(subject, relation, resource, expiresAt);
    }

    async revoke(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>
    ): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.revoke(subject, relation, resource);
    }

    async grantToResources(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resources: Resource<InferDocType<TConfig>>[],
        expiresAt?: number | null
    ): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.grantToResources(subject, relation, resources, expiresAt);
    }

    async revokeFromResources(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resources: Resource<InferDocType<TConfig>>[]
    ): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.revokeFromResources(subject, relation, resources);
    }

    async getUserRelations(
        userId: string,
        type: InferDocType<TConfig>
    ): Promise<GetUserRelationsResponse<InferDocType<TConfig>>> {
        const manager = await this.ensureInitialized();
        return manager.getUserRelations({ user: userId, type });
    }

    // ============================================
    // IGroupManager Implementation
    // ============================================

    async addToGroup(user: string, group: string): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.addToGroup({ user, group });
    }

    async removeFromGroup(user: string, group: string): Promise<SuccessResponse> {
        const manager = await this.ensureInitialized();
        return manager.removeFromGroup({ user, group });
    }

    async listGroups(): Promise<ListGroupsResponse> {
        const manager = await this.ensureInitialized();
        return manager.listGroups();
    }

    async getGroupMembers(group: string): Promise<GetGroupMembersResponse> {
        const manager = await this.ensureInitialized();
        return manager.getGroupMembers({ group });
    }

    async getGroupRelations<TDocType extends string>(
        group?: string
    ): Promise<GetGroupRelationsResponse<TDocType>> {
        const manager = await this.ensureInitialized();
        return manager.getGroupRelations({ group }) as Promise<GetGroupRelationsResponse<TDocType>>;
    }
}

export default CloudflareFGACAdapter

/**
 * Factory function to create a CloudflareFGACAdapter
 */
export function createCloudflareFGACAdapter<TConfig extends FGACConfig>(
    serviceBinding: Service<FGACServiceForConfig<TConfig>>,
    config: TConfig
): CloudflareFGACAdapter<TConfig> {
    return new CloudflareFGACAdapter(serviceBinding, config);
}
