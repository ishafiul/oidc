import { RelationshipData, RelationDefinitionData, IRelationDefinitionRepository } from '../storage/interfaces';
import { CacheManager } from '../cache/cloudflare-cache';
import { isExpired } from '../utils/expiry';

export interface RelationCheckContext {
	user: string;
	relation: string;
	type: string;
	id: string;
}

export interface RelationCheckResult {
	allowed: boolean;
	relation: string;
	cached: boolean;
}

export interface PermissionCheckContext {
	user: string;
	permission: string;
	type: string;
	id: string;
}

export interface PermissionCheckResult {
	allowed: boolean;
	permissions: string[];
	cached: boolean;
}

export interface ResolverDependencies {
	relationRepository: IRelationDefinitionRepository;
	cacheManager: CacheManager;
}

export class RelationResolver {
	private readonly relationRepository: IRelationDefinitionRepository;
	private readonly cacheManager: CacheManager;
	private readonly relationDefMemo = new Map<string, RelationDefinitionData | null>();

	constructor(deps: ResolverDependencies) {
		this.relationRepository = deps.relationRepository;
		this.cacheManager = deps.cacheManager;
	}

	async checkRelation(
		ctx: RelationCheckContext,
		userGroups: string[],
		relationship: RelationshipData
	): Promise<RelationCheckResult> {
		const hasRelation = await this.hasRelation(
			ctx.user,
			ctx.relation,
			userGroups,
			relationship,
			ctx.type
		);

		return {
			allowed: hasRelation,
			relation: ctx.relation,
			cached: false,
		};
	}

	async checkPermission(
		ctx: PermissionCheckContext,
		userGroups: string[],
		relationship: RelationshipData
	): Promise<PermissionCheckResult> {
		const userRelations = this.collectUserRelations(ctx.user, userGroups, relationship);
		const permissions = await this.expandRelationsToPermissions(Array.from(userRelations), ctx.type);

		return {
			allowed: permissions.includes(ctx.permission),
			permissions,
			cached: false,
		};
	}

	private async hasRelation(
		user: string,
		targetRelation: string,
		userGroups: string[],
		relationship: RelationshipData,
		objectType: string
	): Promise<boolean> {
		const userRelations = this.collectUserRelations(user, userGroups, relationship);

		if (userRelations.has(targetRelation)) {
			return true;
		}

		for (const relation of userRelations) {
			const inheritsTarget = await this.relationInherits(objectType, relation, targetRelation);
			if (inheritsTarget) {
				return true;
			}
		}

		return false;
	}

	private async relationInherits(
		objectType: string,
		relation: string,
		targetRelation: string,
		visited: Set<string> = new Set()
	): Promise<boolean> {
		if (visited.has(relation)) {
			return false;
		}
		visited.add(relation);

		const relationDef = await this.getRelationDefinition(objectType, relation);
		if (!relationDef) {
			return false;
		}

		if (relationDef.inherits.includes(targetRelation)) {
			return true;
		}

		for (const parentRelation of relationDef.inherits) {
			const inherits = await this.relationInherits(objectType, parentRelation, targetRelation, visited);
			if (inherits) {
				return true;
			}
		}

		return false;
	}

	collectUserRelations(user: string, userGroups: string[], relationship: RelationshipData): Set<string> {
		const relations = new Set<string>();
		const userSubject = `user:${user}`;

		for (const tuple of relationship.tuples) {
			if (isExpired(tuple)) {
				continue;
			}

			if (tuple.subject === userSubject) {
				relations.add(tuple.relation);
			}

			if (userGroups.includes(tuple.subject)) {
				relations.add(tuple.relation);
			}
		}

		return relations;
	}

	async expandRelationsToPermissions(relations: string[], objectType: string): Promise<string[]> {
		const allPermissions = new Set<string>();
		const processedRelations = new Set<string>();
		const relationQueue = [...relations];

		while (relationQueue.length > 0) {
			const relation = relationQueue.shift()!;
			if (processedRelations.has(relation)) continue;
			processedRelations.add(relation);

			const relationDef = await this.getRelationDefinition(objectType, relation);
			if (relationDef) {
				for (const permission of relationDef.permissions) {
					allPermissions.add(permission);
				}
				for (const inheritedRelation of relationDef.inherits) {
					if (!processedRelations.has(inheritedRelation)) {
						relationQueue.push(inheritedRelation);
					}
				}
			}
		}

		return Array.from(allPermissions);
	}

	private async getRelationDefinition(type: string, relation: string): Promise<RelationDefinitionData | null> {
		const memoKey = `${type}:${relation}`;
		if (this.relationDefMemo.has(memoKey)) {
			return this.relationDefMemo.get(memoKey)!;
		}

		const cached = await this.cacheManager.getRelationDef<RelationDefinitionData>(type, relation);
		if (cached) {
			this.relationDefMemo.set(memoKey, cached);
			return cached;
		}

		const relationDef = await this.relationRepository.get(type, relation);
		if (relationDef) {
			await this.cacheManager.setRelationDef(type, relation, relationDef);
		}
		this.relationDefMemo.set(memoKey, relationDef);

		return relationDef;
	}

	clearMemo(): void {
		this.relationDefMemo.clear();
	}

	invalidateRelationDef(type: string, relation: string): void {
		const memoKey = `${type}:${relation}`;
		this.relationDefMemo.delete(memoKey);
	}
}


