import { WorkerEntrypoint } from 'cloudflare:workers';
import { SchemaRegistry } from '../schema';
import { SchemaConfig } from '../schema';
import { CacheTTL, DEFAULT_CACHE_TTL } from '../cache';
import { AESEncryption } from '../encryption';
import { IEncryption } from '../encryption';
import { PermissionManager } from './permission-manager';
import { createManagerFromSchema, createManagerFromConfig } from './manager-factory';

export interface PermissionServiceEnv {
	PERMISSIONS_KV: KVNamespace;
}

export interface PermissionServiceConfig<
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

export class PermissionService<
	TDocTypes extends readonly [string, ...string[]] = readonly [string, ...string[]],
	TRelations extends readonly [string, ...string[]] = readonly [string, ...string[]],
	TPermissions extends readonly [string, ...string[]] = readonly [string, ...string[]],
> extends WorkerEntrypoint<PermissionServiceEnv> {
	private schema?: SchemaRegistry<TDocTypes, TRelations, TPermissions>;
	private encryption?: IEncryption;
	private cacheTTL: CacheTTL = DEFAULT_CACHE_TTL;

	configure(config: PermissionServiceConfig<TDocTypes, TRelations, TPermissions>): this {
		this.schema = SchemaRegistry.create({
			projectId: config.projectId,
			docTypes: config.docTypes,
			relations: config.relations,
			permissions: config.permissions,
			encryptionKey: config.encryptionKey,
		});

		if (config.encryptionKey) {
			this.encryption = new AESEncryption({ key: config.encryptionKey });
		}

		if (config.cacheTTL) {
			this.cacheTTL = { ...DEFAULT_CACHE_TTL, ...config.cacheTTL };
		}

		return this;
	}

	createManager(): PermissionManager<TDocTypes, TRelations, TPermissions> {
		if (!this.schema) {
			throw new Error('Service not configured. Call configure() first.');
		}

		return createManagerFromSchema(this.env, this.schema, this.encryption, {
			cacheTTL: this.cacheTTL,
		});
	}
}

export function createPermissionService<
	const TDocTypes extends readonly [string, ...string[]],
	const TRelations extends readonly [string, ...string[]],
	const TPermissions extends readonly [string, ...string[]],
>(
	env: PermissionServiceEnv,
	config: SchemaConfig<TDocTypes, TRelations, TPermissions>,
	options?: { cacheTTL?: Partial<CacheTTL> }
): PermissionManager<TDocTypes, TRelations, TPermissions> {
	return createManagerFromConfig(env, config, options);
}
