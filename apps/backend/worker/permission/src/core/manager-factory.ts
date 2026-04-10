import { SchemaRegistry } from '../schema/registry';
import { SchemaConfig } from '../schema/types';
import { KVStorage } from '../storage/kv-storage';
import {
	RelationshipRepository,
	RelationDefinitionRepository,
	GroupMembershipRepository,
} from '../storage/repository';
import { CloudflareCache, CacheKeys, CacheManager } from '../cache/cloudflare-cache';
import { CacheTTL, DEFAULT_CACHE_TTL } from '../cache/interfaces';
import { AESEncryption } from '../encryption/aes-encryption';
import { IEncryption } from '../encryption/interfaces';
import { PermissionManager } from './permission-manager';

export interface ManagerFactoryEnv {
	PERMISSIONS_KV: KVNamespace;
}

export interface ManagerFactoryOptions {
	cacheTTL?: Partial<CacheTTL>;
}

export function createManagerFromSchema<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
>(
	env: ManagerFactoryEnv,
	schema: SchemaRegistry<TDocTypes, TRelations, TPermissions>,
	encryption?: IEncryption,
	options?: ManagerFactoryOptions
): PermissionManager<TDocTypes, TRelations, TPermissions> {
	const storage = new KVStorage(env.PERMISSIONS_KV, { encryption });
	const projectId = schema.projectId;
	const relationshipRepo = new RelationshipRepository(storage, projectId);
	const relationDefRepo = new RelationDefinitionRepository(storage, projectId);
	const groupMembershipRepo = new GroupMembershipRepository(storage, projectId);

	const cache = new CloudflareCache();
	const cacheKeys = new CacheKeys(projectId);
	const cacheTTL = options?.cacheTTL
		? { ...DEFAULT_CACHE_TTL, ...options.cacheTTL }
		: DEFAULT_CACHE_TTL;
	const cacheManager = new CacheManager(cache, cacheKeys, cacheTTL);

	return new PermissionManager({
		schema,
		relationshipRepo,
		relationDefRepo,
		groupMembershipRepo,
		cacheManager,
	});
}

export function createManagerFromConfig<
	const TDocTypes extends readonly [string, ...string[]],
	const TRelations extends readonly [string, ...string[]],
	const TPermissions extends readonly [string, ...string[]],
>(
	env: ManagerFactoryEnv,
	config: SchemaConfig<TDocTypes, TRelations, TPermissions>,
	options?: ManagerFactoryOptions
): PermissionManager<TDocTypes, TRelations, TPermissions> {
	const schema = SchemaRegistry.create(config);

	let encryption: IEncryption | undefined;
	if (config.encryptionKey) {
		encryption = new AESEncryption({ key: config.encryptionKey });
	}

	return createManagerFromSchema(env, schema, encryption, options);
}

