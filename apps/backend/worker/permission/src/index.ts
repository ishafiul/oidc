import { WorkerEntrypoint } from 'cloudflare:workers';
import { SchemaRegistry } from './schema/registry';
import { SchemaConfig } from './schema/types';
import { KVStorage } from './storage/kv-storage';
import {
	RelationshipRepository,
	RelationDefinitionRepository,
	GroupMembershipRepository,
} from './storage/repository';
import { CloudflareCache, CacheKeys, CacheManager } from './cache/cloudflare-cache';
import { CacheTTL, DEFAULT_CACHE_TTL } from './cache/interfaces';
import { AESEncryption } from './encryption/aes-encryption';
import { IEncryption } from './encryption/interfaces';
import { PermissionManager } from './core/permission-manager';
import { createManagerFromConfig } from './core/manager-factory';

export type {
	SchemaConfig,
	InferDocTypes,
	InferRelations,
	InferPermissions,
	InferDocTypeTuple,
	InferRelationTuple,
	InferPermissionTuple,
	InferResource,
	InferUserSubject,
	InferGroupSubject,
	InferApiKeySubject,
	InferSubject,
} from './schema/types';
export { defineConfig } from './schema/types';
export { SchemaRegistry } from './schema/registry';
export { PermissionManager } from './core/permission-manager';
export { PermissionService, createPermissionService } from './core/permission-service';
export type { PermissionServiceEnv, PermissionServiceConfig } from './core/permission-service';
export {
	UserQueryBuilder,
	PermissionCheckBuilder,
	RelationCheckBuilder,
	SubjectGrantBuilder,
	GrantRelationBuilder,
	SubjectRevokeBuilder,
	RevokeRelationBuilder,
} from './core/query-builder';
export type { PermissionCheckExecutor } from './core/query-builder';

export type {
	DefineRelationRequest,
	GrantRelationRequest,
	RevokeRelationRequest,
	CheckRelationRequest,
	CheckPermissionRequest,
	GroupMembershipRequest,
	ListRelationsRequest,
	DeleteRelationRequest,
	GetGroupMembersRequest,
	GetGroupRelationsRequest,
	GrantRelationToMultipleRequest,
	GetUserRelationsRequest,
	RelationResult,
	PermissionResult,
	SuccessResponse,
	ListRelationsResponse,
	ListGroupsResponse,
	GetGroupMembersResponse,
	GetGroupRelationsResponse,
	GetUserRelationsResponse,
	ResourceRelation,
	CanCheckRequest,
	HasRelationRequest,
	GrantRequest,
	RevokeRequest,
	BatchCanCheckRequest,
	BatchCanCheckResult,
	BatchGrantRequest,
	GetAllPermissionsRequest,
	GetAllPermissionsResponse,
} from './dto/schema';

export type {
	Subject,
	UserSubject,
	GroupSubject,
	ApiKeySubject,
	SubjectType,
	ParsedSubject,
	Relation,
	RelationTuple,
	RelationshipTuples,
	RelationDefinition,
	Resource,
} from './entity/types';

export {
	user,
	group,
	apiKey,
	resource,
	isResource,
	parseSubject,
	createUserSubject,
	createGroupSubject,
	createApiKeySubject,
} from './entity/types';

export type {
	IStorage,
	IRelationshipRepository,
	IRelationDefinitionRepository,
	IGroupMembershipRepository,
	RelationshipData,
	RelationDefinitionData,
	RelationTupleData,
} from './storage/interfaces';

export type { ICache, CacheTTL, CacheKeyGenerator } from './cache/interfaces';
export { DEFAULT_CACHE_TTL } from './cache/interfaces';

export type { IEncryption } from './encryption/interfaces';
export { AESEncryption } from './encryption/aes-encryption';

export type Bindings = {
	PERMISSIONS_KV: KVNamespace;
};

export interface FGACServiceConfig<
	TDocTypes extends readonly [string, ...string[]],
	TRelations extends readonly [string, ...string[]],
	TPermissions extends readonly [string, ...string[]],
> {
	projectId: string;
	docTypes: TDocTypes;
	relations: TRelations;
	permissions: TPermissions;
	encryptionKey?: string;
	cacheTTL?: Partial<CacheTTL>;
}

export class FGACService<
	TDocTypes extends readonly [string, ...string[]] = readonly [string, ...string[]],
	TRelations extends readonly [string, ...string[]] = readonly [string, ...string[]],
	TPermissions extends readonly [string, ...string[]] = readonly [string, ...string[]],
> extends WorkerEntrypoint<Bindings> {
	private config?: FGACServiceConfig<TDocTypes, TRelations, TPermissions>;
	private cacheTTL: CacheTTL = DEFAULT_CACHE_TTL;

	async ping(): Promise<{ ok: boolean; message: string; hasKV: boolean }> {
		return {
			ok: true,
			message: 'FGAC Service is alive',
			hasKV: !!this.env.PERMISSIONS_KV,
		};
	}

	async withConfig(config: FGACServiceConfig<TDocTypes, TRelations, TPermissions>): Promise<{ ok: boolean }> {
		try {
			this.config = config;
			if (config.cacheTTL) {
				this.cacheTTL = { ...DEFAULT_CACHE_TTL, ...config.cacheTTL };
			}
			return { ok: true };
		} catch (error) {
			throw error;
		}
	}

	async newPermissionManager(
		config?: FGACServiceConfig<TDocTypes, TRelations, TPermissions>
	): Promise<PermissionManager<TDocTypes, TRelations, TPermissions>> {
		const effectiveConfig = config ?? this.config;
		if (!effectiveConfig) {
			throw new Error('Service not configured. Call withConfig() first or pass config to newPermissionManager().');
		}

		if (!this.env.PERMISSIONS_KV) {
			throw new Error('PERMISSIONS_KV binding is not available');
		}

		return createManagerFromConfig(
			this.env,
			{
				projectId: effectiveConfig.projectId,
				docTypes: effectiveConfig.docTypes,
				relations: effectiveConfig.relations,
				permissions: effectiveConfig.permissions,
				encryptionKey: effectiveConfig.encryptionKey,
			},
			{ cacheTTL: this.cacheTTL }
		);
	}
}

export function createFGACManager<
	const TDocTypes extends readonly [string, ...string[]],
	const TRelations extends readonly [string, ...string[]],
	const TPermissions extends readonly [string, ...string[]],
>(
	env: Bindings,
	config: SchemaConfig<TDocTypes, TRelations, TPermissions>,
	options?: { cacheTTL?: Partial<CacheTTL> }
): PermissionManager<TDocTypes, TRelations, TPermissions> {
	return createManagerFromConfig(env, config, options);
}

export default {
	fetch(_request: Request, _env: Bindings, _ctx: ExecutionContext) {
		return new Response('FGAC Permission Manager API');
	},
};
