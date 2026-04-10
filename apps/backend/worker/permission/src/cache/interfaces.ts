export interface CacheTTL {
	relationship: number;
	relationDef: number;
	permissions: number;
}

export interface ICache {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface CacheKeyGenerator {
	relationship(type: string, id: string): string;
	relationDef(type: string, relation: string): string;
	relation(user: string, type: string, id: string, relation: string): string;
	permission(user: string, type: string, id: string, permission: string): string;
	userGroups(user: string): string;
	relationsList(type: string): string;
	groupsList(): string;
	groupMembers(group: string): string;
	groupRelations(group?: string): string;
}

export const DEFAULT_CACHE_TTL: CacheTTL = {
	relationship: 60,
	relationDef: 300,
	permissions: 120,
};
