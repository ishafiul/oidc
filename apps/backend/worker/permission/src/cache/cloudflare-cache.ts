import { ICache, CacheKeyGenerator, CacheTTL, DEFAULT_CACHE_TTL } from './interfaces';

const CACHE_KEY_PREFIX = 'https://permission-manager.internal/';

export class CloudflareCache implements ICache {
	private readonly cache = caches.default;

	private fullKey(key: string): string {
		return `${CACHE_KEY_PREFIX}${key}`;
	}

	async get<T>(key: string): Promise<T | null> {
		const response = await this.cache.match(this.fullKey(key));
		if (!response) return null;
		return response.json() as Promise<T>;
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		const response = new Response(JSON.stringify(value), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `max-age=${ttlSeconds}`,
			},
		});
		await this.cache.put(this.fullKey(key), response);
	}

	async delete(key: string): Promise<void> {
		await this.cache.delete(this.fullKey(key));
	}
}

export class CacheKeys implements CacheKeyGenerator {
	constructor(private readonly projectId: string) {}

	relationship(type: string, id: string): string {
		return `project:${this.projectId}:rel:${type}:${id}`;
	}

	relationDef(type: string, relation: string): string {
		return `project:${this.projectId}:relation_def:${type}:${relation}`;
	}

	relation(user: string, type: string, id: string, relation: string): string {
		return `project:${this.projectId}:relation:${user}:${type}:${id}:${relation}`;
	}

	permission(user: string, type: string, id: string, permission: string): string {
		return `project:${this.projectId}:perm:${user}:${type}:${id}:${permission}`;
	}

	userGroups(user: string): string {
		return `project:${this.projectId}:groups:${user}`;
	}

	relationsList(type: string): string {
		return `project:${this.projectId}:relations-list:${type}`;
	}

	groupsList(): string {
		return `project:${this.projectId}:groups-list`;
	}

	groupMembers(group: string): string {
		return `project:${this.projectId}:group-members:${group}`;
	}

	groupRelations(group?: string): string {
		return group
			? `project:${this.projectId}:group-relations:${group}`
			: `project:${this.projectId}:all-group-relations`;
	}
}

export interface CachedRelationResult {
	allowed: boolean;
	relation: string;
	cachedAt: number;
}

export interface CachedPermissionResult {
	allowed: boolean;
	permissions: string[];
	cachedAt: number;
}

export class CacheManager {
	private readonly cache: ICache;
	private readonly keys: CacheKeyGenerator;
	private readonly ttl: CacheTTL;

	constructor(cache: ICache, keys: CacheKeyGenerator, ttl: CacheTTL = DEFAULT_CACHE_TTL) {
		this.cache = cache;
		this.keys = keys;
		this.ttl = ttl;
	}

	async getRelationship<T>(type: string, id: string): Promise<T | null> {
		return this.cache.get<T>(this.keys.relationship(type, id));
	}

	async setRelationship<T>(type: string, id: string, value: T): Promise<void> {
		await this.cache.set(this.keys.relationship(type, id), value, this.ttl.relationship);
	}

	async invalidateRelationship(type: string, id: string): Promise<void> {
		await this.cache.delete(this.keys.relationship(type, id));
	}

	async getRelationDef<T>(type: string, relation: string): Promise<T | null> {
		return this.cache.get<T>(this.keys.relationDef(type, relation));
	}

	async setRelationDef<T>(type: string, relation: string, value: T): Promise<void> {
		await this.cache.set(this.keys.relationDef(type, relation), value, this.ttl.relationDef);
	}

	async invalidateRelationDef(type: string, relation: string): Promise<void> {
		await this.cache.delete(this.keys.relationDef(type, relation));
	}

	async getRelation(
		user: string,
		type: string,
		id: string,
		relation: string
	): Promise<CachedRelationResult | null> {
		const result = await this.cache.get<CachedRelationResult>(
			this.keys.relation(user, type, id, relation)
		);
		if (!result) return null;
		if (Date.now() - result.cachedAt > this.ttl.permissions * 1000) {
			return null;
		}
		return result;
	}

	async setRelation(
		user: string,
		type: string,
		id: string,
		relation: string,
		result: CachedRelationResult
	): Promise<void> {
		await this.cache.set(
			this.keys.relation(user, type, id, relation),
			result,
			this.ttl.permissions
		);
	}

	async invalidateRelation(
		user: string,
		type: string,
		id: string,
		relation: string
	): Promise<void> {
		await this.cache.delete(this.keys.relation(user, type, id, relation));
	}

	async getPermission(
		user: string,
		type: string,
		id: string,
		permission: string
	): Promise<CachedPermissionResult | null> {
		const result = await this.cache.get<CachedPermissionResult>(
			this.keys.permission(user, type, id, permission)
		);
		if (!result) return null;
		if (Date.now() - result.cachedAt > this.ttl.permissions * 1000) {
			return null;
		}
		return result;
	}

	async setPermission(
		user: string,
		type: string,
		id: string,
		permission: string,
		result: CachedPermissionResult
	): Promise<void> {
		await this.cache.set(
			this.keys.permission(user, type, id, permission),
			result,
			this.ttl.permissions
		);
	}

	async invalidatePermission(
		user: string,
		type: string,
		id: string,
		permission: string
	): Promise<void> {
		await this.cache.delete(this.keys.permission(user, type, id, permission));
	}

	async getUserGroups(user: string): Promise<string[] | null> {
		return this.cache.get<string[]>(this.keys.userGroups(user));
	}

	async setUserGroups(user: string, groups: string[]): Promise<void> {
		await this.cache.set(this.keys.userGroups(user), groups, this.ttl.relationship);
	}

	async invalidateUserGroups(user: string): Promise<void> {
		await this.cache.delete(this.keys.userGroups(user));
	}

	async getRelationsList<T>(type: string): Promise<T | null> {
		return this.cache.get<T>(this.keys.relationsList(type));
	}

	async setRelationsList<T>(type: string, relations: T): Promise<void> {
		await this.cache.set(this.keys.relationsList(type), relations, this.ttl.relationDef);
	}

	async invalidateRelationsList(type: string): Promise<void> {
		await this.cache.delete(this.keys.relationsList(type));
	}

	async getGroupsList(): Promise<string[] | null> {
		return this.cache.get<string[]>(this.keys.groupsList());
	}

	async setGroupsList(groups: string[]): Promise<void> {
		await this.cache.set(this.keys.groupsList(), groups, this.ttl.relationship);
	}

	async invalidateGroupsList(): Promise<void> {
		await this.cache.delete(this.keys.groupsList());
	}

	async getGroupMembers(group: string): Promise<string[] | null> {
		return this.cache.get<string[]>(this.keys.groupMembers(group));
	}

	async setGroupMembers(group: string, members: string[]): Promise<void> {
		await this.cache.set(this.keys.groupMembers(group), members, this.ttl.relationship);
	}

	async invalidateGroupMembers(group: string): Promise<void> {
		await this.cache.delete(this.keys.groupMembers(group));
	}

	async getGroupRelations<T>(group?: string): Promise<T | null> {
		return this.cache.get<T>(this.keys.groupRelations(group));
	}

	async setGroupRelations<T>(value: T, group?: string): Promise<void> {
		await this.cache.set(this.keys.groupRelations(group), value, this.ttl.relationship);
	}

	async invalidateGroupRelations(group?: string): Promise<void> {
		await this.cache.delete(this.keys.groupRelations(group));
	}
}
