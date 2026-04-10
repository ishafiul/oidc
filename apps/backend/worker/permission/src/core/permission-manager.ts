import { RpcTarget } from 'cloudflare:workers';
import { z } from 'zod';
import { SchemaRegistry } from '../schema/registry';
import {
	IRelationshipRepository,
	IRelationDefinitionRepository,
	IGroupMembershipRepository,
	RelationDefinitionData,
	RelationshipData,
} from '../storage/interfaces';
import { CacheManager } from '../cache/cloudflare-cache';
import { RelationResolver } from '../resolver/relation-resolver';
import {
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
	GroupMembershipRequestSchema,
	GetGroupMembersRequestSchema,
	GetGroupRelationsRequestSchema,
	createDefineRelationRequestSchema,
	createGrantRelationRequestSchema,
	createRevokeRelationRequestSchema,
	createCheckRelationRequestSchema,
	createCheckPermissionRequestSchema,
	createListRelationsRequestSchema,
	createDeleteRelationRequestSchema,
	createGrantRelationToMultipleRequestSchema,
	createGetUserRelationsRequestSchema,
	BatchCanCheckResult,
	GetAllPermissionsResponse,
} from '../dto/schema';
import { RelationSchema } from '../entity/schema';
import {
	Resource,
	Subject,
	parseSubject,
} from '../entity/types';
import {
	UserQueryBuilder,
	SubjectGrantBuilder,
	SubjectRevokeBuilder,
	PermissionCheckExecutor,
} from './query-builder';
import { isExpired } from '../utils/expiry';

export interface PermissionManagerDeps<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	schema: SchemaRegistry<TDocTypes, TRelations, TPermissions>;
	relationshipRepo: IRelationshipRepository;
	relationDefRepo: IRelationDefinitionRepository;
	groupMembershipRepo: IGroupMembershipRepository;
	cacheManager: CacheManager;
}

export class PermissionManager<
	TDocTypes extends readonly string[] = readonly string[],
	TRelations extends readonly string[] = readonly string[],
	TPermissions extends readonly string[] = readonly string[],
> extends RpcTarget {
	private readonly schema: SchemaRegistry<TDocTypes, TRelations, TPermissions>;
	private readonly relationshipRepo: IRelationshipRepository;
	private readonly relationDefRepo: IRelationDefinitionRepository;
	private readonly groupMembershipRepo: IGroupMembershipRepository;
	private readonly cacheManager: CacheManager;
	private readonly resolver: RelationResolver;

	private readonly defineRelationSchema: ReturnType<
		typeof createDefineRelationRequestSchema
	>;
	private readonly grantRelationSchema: ReturnType<
		typeof createGrantRelationRequestSchema
	>;
	private readonly revokeRelationSchema: ReturnType<
		typeof createRevokeRelationRequestSchema
	>;
	private readonly checkRelationSchema: ReturnType<
		typeof createCheckRelationRequestSchema
	>;
	private readonly checkPermissionSchema: ReturnType<
		typeof createCheckPermissionRequestSchema
	>;
	private readonly listRelationsSchema: ReturnType<
		typeof createListRelationsRequestSchema
	>;
	private readonly deleteRelationSchema: ReturnType<
		typeof createDeleteRelationRequestSchema
	>;
	private readonly grantRelationToMultipleSchema: ReturnType<
		typeof createGrantRelationToMultipleRequestSchema
	>;
	private readonly getUserRelationsSchema: ReturnType<
		typeof createGetUserRelationsRequestSchema
	>;

	constructor(deps: PermissionManagerDeps<TDocTypes, TRelations, TPermissions>) {
		super();
		this.schema = deps.schema;
		this.relationshipRepo = deps.relationshipRepo;
		this.relationDefRepo = deps.relationDefRepo;
		this.groupMembershipRepo = deps.groupMembershipRepo;
		this.cacheManager = deps.cacheManager;
		this.resolver = new RelationResolver({
			relationRepository: deps.relationDefRepo,
			cacheManager: deps.cacheManager,
		});

		const docTypeSchema = this.schema.docTypeSchema;
		const permissionSchema = this.schema.permissionSchema;

		this.defineRelationSchema = createDefineRelationRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createDefineRelationRequestSchema>[0],
			permissionSchema as unknown as Parameters<typeof createDefineRelationRequestSchema>[1]
		);
		this.grantRelationSchema = createGrantRelationRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createGrantRelationRequestSchema>[0]
		);
		this.revokeRelationSchema = createRevokeRelationRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createRevokeRelationRequestSchema>[0]
		);
		this.checkRelationSchema = createCheckRelationRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createCheckRelationRequestSchema>[0],
			RelationSchema as unknown as Parameters<typeof createCheckRelationRequestSchema>[1]
		);
		this.checkPermissionSchema = createCheckPermissionRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createCheckPermissionRequestSchema>[0],
			permissionSchema as unknown as Parameters<typeof createCheckPermissionRequestSchema>[1]
		);
		this.listRelationsSchema = createListRelationsRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createListRelationsRequestSchema>[0]
		);
		this.deleteRelationSchema = createDeleteRelationRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createDeleteRelationRequestSchema>[0]
		);
		this.grantRelationToMultipleSchema = createGrantRelationToMultipleRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createGrantRelationToMultipleRequestSchema>[0]
		);
		this.getUserRelationsSchema = createGetUserRelationsRequestSchema(
			docTypeSchema as unknown as Parameters<typeof createGetUserRelationsRequestSchema>[0]
		);
	}

	async defineRelation(
		request: DefineRelationRequest<TDocTypes[number], TPermissions[number]>
	): Promise<SuccessResponse> {
		const validated = this.defineRelationSchema.parse(request) as DefineRelationRequest<
			TDocTypes[number],
			TPermissions[number]
		>;

		const relationDef: RelationDefinitionData = {
			permissions: validated.permissions,
			inherits: validated.inherits ?? [],
		};

		await this.relationDefRepo.save(validated.type, validated.relation, relationDef);

		await this.cacheManager.invalidateRelationDef(validated.type, validated.relation);
		await this.cacheManager.invalidateRelationsList(validated.type);
		this.resolver.invalidateRelationDef(validated.type, validated.relation);

		return { ok: true };
	}

	async deleteRelation(
		request: DeleteRelationRequest<TDocTypes[number]>
	): Promise<SuccessResponse> {
		const validated = this.deleteRelationSchema.parse(request) as DeleteRelationRequest<TDocTypes[number]>;

		await this.relationDefRepo.delete(validated.type, validated.relation);
		await this.cacheManager.invalidateRelationDef(validated.type, validated.relation);
		await this.cacheManager.invalidateRelationsList(validated.type);
		this.resolver.invalidateRelationDef(validated.type, validated.relation);

		return { ok: true };
	}

	private async assertRelationDefinedForGrant(type: TDocTypes[number], relation: string): Promise<void> {
		const existing = await this.relationDefRepo.get(type, relation);
		if (!existing) {
			throw new Error(
				`Cannot grant relation "${relation}" on doc type "${type}": define it for this type first (defineRelation).`,
			);
		}
	}

	async listRelations(
		request: ListRelationsRequest<TDocTypes[number]>
	): Promise<ListRelationsResponse<TPermissions[number]>> {
		const validated = this.listRelationsSchema.parse(request) as ListRelationsRequest<TDocTypes[number]>;

		const cached = await this.cacheManager.getRelationsList<ListRelationsResponse<TPermissions[number]>>(
			validated.type
		);
		if (cached) return cached;

		const relationsList = await this.relationDefRepo.listByType(validated.type);
		const relations: Record<string, RelationDefinitionData> = {};

		for (const { relation, data } of relationsList) {
			relations[relation] = data;
		}

		const result: ListRelationsResponse<TPermissions[number]> = { relations };
		await this.cacheManager.setRelationsList(validated.type, result);

		return result;
	}

	async grantRelation(
		request: GrantRelationRequest<TDocTypes[number]>
	): Promise<SuccessResponse> {
		const validated = this.grantRelationSchema.parse(request) as GrantRelationRequest<TDocTypes[number]>;

		await this.assertRelationDefinedForGrant(validated.type, validated.relation);

		await this.relationshipRepo.addTuple(validated.type, validated.id, {
			subject: validated.subject,
			relation: validated.relation,
			expires_at: validated.expires_at ?? undefined,
		});

		await this.invalidateResourceCaches(validated.type, validated.id);
		await this.cacheManager.invalidateGroupRelations();
		await this.cacheManager.invalidateGroupsList();

		const parsedSubject = parseSubject(validated.subject);
		if (parsedSubject.type === 'group') {
			await this.cacheManager.invalidateGroupRelations(parsedSubject.id);
		}

		return { ok: true };
	}

	async revokeRelation(
		request: RevokeRelationRequest<TDocTypes[number]>
	): Promise<SuccessResponse> {
		const validated = this.revokeRelationSchema.parse(request) as RevokeRelationRequest<TDocTypes[number]>;

		await this.relationshipRepo.removeTuple(
			validated.type,
			validated.id,
			validated.subject,
			validated.relation
		);
		await this.invalidateResourceCaches(validated.type, validated.id);
		await this.cacheManager.invalidateGroupRelations();
		await this.cacheManager.invalidateGroupsList();

		const parsedSubject = parseSubject(validated.subject);
		if (parsedSubject.type === 'group') {
			await this.cacheManager.invalidateGroupRelations(parsedSubject.id);
		}

		return { ok: true };
	}

	/**
	 * Grants a relation to multiple resources.
	 *
	 * NOTE: This operation performs N individual KV operations where N is the
	 * number of resource IDs. For large batches, consider chunking the requests
	 * or using a queue for background processing. Future optimization: use KV
	 * batch API if/when available.
	 */
	async grantRelationToMultiple(
		request: GrantRelationToMultipleRequest<TDocTypes[number]>
	): Promise<SuccessResponse> {
		const validated = this.grantRelationToMultipleSchema.parse(request) as GrantRelationToMultipleRequest<TDocTypes[number]>;
		const { subject, relation, type, ids, expires_at } = validated;

		await this.assertRelationDefinedForGrant(type, relation);

		await Promise.all(
			ids.map(async (id: string) => {
				await this.relationshipRepo.addTuple(type, id, {
					subject,
					relation,
					expires_at: expires_at ?? undefined,
				});
				await this.invalidateResourceCaches(type, id);
			})
		);

		await this.cacheManager.invalidateGroupRelations();
		await this.cacheManager.invalidateGroupsList();

		const parsedSubject = parseSubject(subject);
		if (parsedSubject.type === 'group') {
			await this.cacheManager.invalidateGroupRelations(parsedSubject.id);
		}

		return { ok: true };
	}

	async addToGroup(request: GroupMembershipRequest): Promise<SuccessResponse> {
		const validated = GroupMembershipRequestSchema.parse(request);
		const { user, group } = validated;

		await this.groupMembershipRepo.addToGroup(user, group);
		await this.cacheManager.invalidateUserGroups(user);
		await this.cacheManager.invalidateGroupsList();
		await this.cacheManager.invalidateGroupMembers(group);

		return { ok: true };
	}

	async removeFromGroup(request: GroupMembershipRequest): Promise<SuccessResponse> {
		const validated = GroupMembershipRequestSchema.parse(request);
		const { user, group } = validated;

		await this.groupMembershipRepo.removeFromGroup(user, group);
		await this.cacheManager.invalidateUserGroups(user);
		await this.cacheManager.invalidateGroupMembers(group);

		return { ok: true };
	}

	async checkRelation(
		request: CheckRelationRequest<TDocTypes[number], TRelations[number]>
	): Promise<RelationResult> {
		const validated = this.checkRelationSchema.parse(request) as CheckRelationRequest<
			TDocTypes[number],
			TRelations[number]
		>;

		const bypassCache = validated.bypassCache ?? false;
		const userGroups = await this.getUserGroupsInternal(validated.user, bypassCache);
		const relationship = await this.getRelationshipInternal(validated.type, validated.id, bypassCache);

		const result = await this.resolver.checkRelation(
			{
				user: validated.user,
				relation: validated.relation,
				type: validated.type,
				id: validated.id,
			},
			userGroups,
			relationship
		);

		return result;
	}

	async checkPermission(
		request: CheckPermissionRequest<TDocTypes[number], TPermissions[number]>
	): Promise<PermissionResult> {
		const validated = this.checkPermissionSchema.parse(request) as CheckPermissionRequest<
			TDocTypes[number],
			TPermissions[number]
		>;

		const bypassCache = validated.bypassCache ?? false;
		const userGroups = await this.getUserGroupsInternal(validated.user, bypassCache);
		const relationship = await this.getRelationshipInternal(validated.type, validated.id, bypassCache);

		const result = await this.resolver.checkPermission(
			{
				user: validated.user,
				type: validated.type,
				id: validated.id,
				permission: validated.permission,
			},
			userGroups,
			relationship
		);

		return result;
	}

	async getUserRelations(
		request: GetUserRelationsRequest<TDocTypes[number]>
	): Promise<GetUserRelationsResponse<TDocTypes[number]>> {
		const validated = this.getUserRelationsSchema.parse(request) as GetUserRelationsRequest<
			TDocTypes[number]
		>;

		const relationships = await this.relationshipRepo.listByType(validated.type);
		const userSubjectStr = `user:${validated.user}`;
		const userGroups = await this.getUserGroupsInternal(validated.user);

		const relations: GetUserRelationsResponse<TDocTypes[number]>['relations'] = [];

		for (const { id, data } of relationships) {
			for (const tuple of data.tuples) {
				if (isExpired(tuple)) {
					continue;
				}

				if (tuple.subject === userSubjectStr || userGroups.includes(tuple.subject)) {
					relations.push({
						type: validated.type,
						id,
						relation: tuple.relation,
						expires_at: tuple.expires_at ?? null,
					});
				}
			}
		}

		return { relations };
	}

	async listGroups(): Promise<ListGroupsResponse> {
		const cached = await this.cacheManager.getGroupsList();
		if (cached) return { groups: cached };

		const groupsFromMemberships = await this.groupMembershipRepo.listAllGroups();
		const allRelationships = await this.relationshipRepo.listAll();

		const uniqueGroups = new Set(groupsFromMemberships);

		for (const { data } of allRelationships) {
			for (const tuple of data.tuples) {
				const parsed = parseSubject(tuple.subject as Subject);
				if (parsed.type === 'group') {
					uniqueGroups.add(parsed.id);
				}
			}
		}

		const groups = Array.from(uniqueGroups);
		await this.cacheManager.setGroupsList(groups);

		return { groups };
	}

	async getGroupMembers(request: GetGroupMembersRequest): Promise<GetGroupMembersResponse> {
		const validated = GetGroupMembersRequestSchema.parse(request);
		const { group } = validated;

		const cached = await this.cacheManager.getGroupMembers(group);
		if (cached) return { users: cached };

		const members = await this.groupMembershipRepo.getGroupMembers(group);
		await this.cacheManager.setGroupMembers(group, members);

		return { users: members };
	}

	async getGroupRelations(
		request: GetGroupRelationsRequest
	): Promise<GetGroupRelationsResponse<TDocTypes[number]>> {
		const validated = GetGroupRelationsRequestSchema.parse(request);
		const { group } = validated;

		const cached = await this.cacheManager.getGroupRelations<
			GetGroupRelationsResponse<TDocTypes[number]>
		>(group);
		if (cached) return cached;

		const allRelationships = await this.relationshipRepo.listAll();
		const groupRelations: Record<string, ResourceRelation<TDocTypes[number]>[]> = {};

		for (const { type, id, data } of allRelationships) {
			for (const tuple of data.tuples) {
				const parsedSubject = parseSubject(tuple.subject as Subject);
				if (parsedSubject.type !== 'group') continue;
				const groupName = parsedSubject.id;

				if (group && groupName !== group) continue;

				if (!groupRelations[groupName]) {
					groupRelations[groupName] = [];
				}

				groupRelations[groupName].push({
					type: type as TDocTypes[number],
					id,
					relation: tuple.relation,
					expires_at: tuple.expires_at ?? null,
				});
			}
		}

		const result: GetGroupRelationsResponse<TDocTypes[number]> = { groups: groupRelations };
		await this.cacheManager.setGroupRelations(result, group);

		return result;
	}

	private async getUserGroupsInternal(user: string, bypassCache = false): Promise<string[]> {
		if (!bypassCache) {
			const cached = await this.cacheManager.getUserGroups(user);
			if (cached) return cached;
		}

		const groups = await this.groupMembershipRepo.getGroups(user);
		await this.cacheManager.setUserGroups(user, groups);

		return groups;
	}

	private async getRelationshipInternal(
		type: TDocTypes[number],
		id: string,
		bypassCache = false
	): Promise<RelationshipData> {
		if (!bypassCache) {
			const cached = await this.cacheManager.getRelationship<RelationshipData>(type, id);
			if (cached) return cached;
		}

		const relationship = await this.relationshipRepo.get(type, id);
		await this.cacheManager.setRelationship(type, id, relationship);
		return relationship;
	}

	private async invalidateResourceCaches(type: TDocTypes[number], id: string): Promise<void> {
		await this.cacheManager.invalidateRelationship(type, id);
	}

	private getExecutor(): PermissionCheckExecutor<TDocTypes, TRelations, TPermissions> {
		return {
			checkPermission: async (userId, permission, type, id, bypassCache) => {
				const result = await this.checkPermission({
					user: userId,
					permission,
					type,
					id,
					bypassCache,
				});
				return {
					allowed: result.allowed,
					permissions: result.permissions,
					cached: result.cached,
				};
			},
			checkRelation: async (userId, relation, type, id, bypassCache) => {
				const result = await this.checkRelation({
					user: userId,
					relation,
					type,
					id,
					bypassCache,
				});
				return {
					allowed: result.allowed,
					relation: result.relation,
					cached: result.cached,
				};
			},
			grantRelation: async (subject, relation, type, id, expiresAt) => {
				return this.grantRelation({
					subject,
					relation,
					type,
					id,
					expires_at: expiresAt,
				});
			},
			revokeRelation: async (subject, relation, type, id) => {
				return this.revokeRelation({
					subject,
					relation,
					type,
					id,
				});
			},
		};
	}

	user(userId: string): UserQueryBuilder<TDocTypes, TRelations, TPermissions> {
		return new UserQueryBuilder(userId, this.getExecutor());
	}

	grantTo(subject: Subject): SubjectGrantBuilder<TDocTypes, TRelations, TPermissions> {
		return new SubjectGrantBuilder(subject, this.getExecutor());
	}

	revokeFrom(subject: Subject): SubjectRevokeBuilder<TDocTypes, TRelations, TPermissions> {
		return new SubjectRevokeBuilder(subject, this.getExecutor());
	}

	async can(
		userId: string,
		permission: TPermissions[number],
		resource: Resource<TDocTypes[number]>,
		bypassCache?: boolean
	): Promise<boolean> {
		const result = await this.checkPermission({
			user: userId,
			permission,
			type: resource.type,
			id: resource.id,
			bypassCache,
		});
		return result.allowed;
	}

	async has(
		userId: string,
		relation: TRelations[number],
		resource: Resource<TDocTypes[number]>,
		bypassCache?: boolean
	): Promise<boolean> {
		const result = await this.checkRelation({
			user: userId,
			relation,
			type: resource.type,
			id: resource.id,
			bypassCache,
		});
		return result.allowed;
	}

	async grant(
		subject: Subject,
		relation: TRelations[number],
		resource: Resource<TDocTypes[number]>,
		expiresAt?: number | null
	): Promise<SuccessResponse> {
		return this.grantRelation({
			subject,
			relation,
			type: resource.type,
			id: resource.id,
			expires_at: expiresAt,
		});
	}

	async revoke(
		subject: Subject,
		relation: TRelations[number],
		resource: Resource<TDocTypes[number]>
	): Promise<SuccessResponse> {
		return this.revokeRelation({
			subject,
			relation,
			type: resource.type,
			id: resource.id,
		});
	}

	async canAll(
		userId: string,
		permissions: TPermissions[number][],
		resource: Resource<TDocTypes[number]>,
		bypassCache?: boolean
	): Promise<BatchCanCheckResult<TPermissions[number]>> {
		const results = {} as Record<TPermissions[number], boolean>;

		await Promise.all(
			permissions.map(async (permission) => {
				const result = await this.checkPermission({
					user: userId,
					permission,
					type: resource.type,
					id: resource.id,
					bypassCache,
				});
				results[permission] = result.allowed;
			})
		);

		const allAllowed = permissions.every((p) => results[p]);
		const anyAllowed = permissions.some((p) => results[p]);

		return { results, allAllowed, anyAllowed };
	}

	async canAny(
		userId: string,
		permissions: TPermissions[number][],
		resource: Resource<TDocTypes[number]>,
		bypassCache?: boolean
	): Promise<boolean> {
		const result = await this.canAll(userId, permissions, resource, bypassCache);
		return result.anyAllowed;
	}

	/**
	 * Grants a relation to multiple resources.
	 *
	 * NOTE: This operation performs N individual KV operations where N is the
	 * number of resources. For large batches, consider chunking the requests
	 * or using a queue for background processing.
	 */
	async grantToResources(
		subject: Subject,
		relation: TRelations[number],
		resources: Resource<TDocTypes[number]>[],
		expiresAt?: number | null
	): Promise<SuccessResponse> {
		await Promise.all(
			resources.map((resource) =>
				this.grantRelation({
					subject,
					relation,
					type: resource.type,
					id: resource.id,
					expires_at: expiresAt,
				})
			)
		);
		return { ok: true };
	}

	/**
	 * Revokes a relation from multiple resources.
	 *
	 * NOTE: This operation performs N individual KV operations where N is the
	 * number of resources. For large batches, consider chunking the requests
	 * or using a queue for background processing.
	 */
	async revokeFromResources(
		subject: Subject,
		relation: TRelations[number],
		resources: Resource<TDocTypes[number]>[]
	): Promise<SuccessResponse> {
		await Promise.all(
			resources.map((resource) =>
				this.revokeRelation({
					subject,
					relation,
					type: resource.type,
					id: resource.id,
				})
			)
		);
		return { ok: true };
	}

	async getAllPermissions(
		userId: string,
		resource: Resource<TDocTypes[number]>,
		bypassCache?: boolean
	): Promise<GetAllPermissionsResponse<TPermissions[number]>> {
		const skipCache = bypassCache ?? false;
		const userGroups = await this.getUserGroupsInternal(userId, skipCache);
		const relationship = await this.getRelationshipInternal(resource.type, resource.id, skipCache);

		const relations = this.resolver.collectUserRelations(userId, userGroups, relationship);
		const permissions = await this.resolver.expandRelationsToPermissions(
			Array.from(relations),
			resource.type
		);

		return {
			permissions: permissions as TPermissions[number][],
			relations: Array.from(relations),
		};
	}
}
