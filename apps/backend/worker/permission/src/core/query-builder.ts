import { Resource, Subject, user as userSubject, group as groupSubject, apiKey as apiKeySubject } from '../entity/types';

export interface PermissionCheckExecutor<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	checkPermission(
		userId: string,
		permission: TPermissions[number],
		type: TDocTypes[number],
		id: string,
		bypassCache?: boolean
	): Promise<{ allowed: boolean; permissions: TPermissions[number][]; cached?: boolean }>;

	checkRelation(
		userId: string,
		relation: TRelations[number],
		type: TDocTypes[number],
		id: string,
		bypassCache?: boolean
	): Promise<{ allowed: boolean; relation: string; cached?: boolean }>;

	grantRelation(
		subject: Subject,
		relation: TRelations[number],
		type: TDocTypes[number],
		id: string,
		expiresAt?: number | null
	): Promise<{ ok: boolean }>;

	revokeRelation(
		subject: Subject,
		relation: TRelations[number],
		type: TDocTypes[number],
		id: string
	): Promise<{ ok: boolean }>;
}

export class UserQueryBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	constructor(
		private readonly userId: string,
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	can(permission: TPermissions[number]): PermissionCheckBuilder<TDocTypes, TRelations, TPermissions> {
		return new PermissionCheckBuilder(this.userId, permission, this.executor);
	}

	has(relation: TRelations[number]): RelationCheckBuilder<TDocTypes, TRelations, TPermissions> {
		return new RelationCheckBuilder(this.userId, relation, this.executor);
	}
}

export class PermissionCheckBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	private bypassCacheFlag = false;

	constructor(
		private readonly userId: string,
		private readonly permission: TPermissions[number],
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	bypassCache(): this {
		this.bypassCacheFlag = true;
		return this;
	}

	on(resource: Resource<TDocTypes[number]>): Promise<boolean> {
		return this.executor
			.checkPermission(this.userId, this.permission, resource.type, resource.id, this.bypassCacheFlag)
			.then((result) => result.allowed);
	}

	onResource(type: TDocTypes[number], id: string): Promise<boolean> {
		return this.executor
			.checkPermission(this.userId, this.permission, type, id, this.bypassCacheFlag)
			.then((result) => result.allowed);
	}
}

export class RelationCheckBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	private bypassCacheFlag = false;

	constructor(
		private readonly userId: string,
		private readonly relation: TRelations[number],
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	bypassCache(): this {
		this.bypassCacheFlag = true;
		return this;
	}

	on(resource: Resource<TDocTypes[number]>): Promise<boolean> {
		return this.executor
			.checkRelation(this.userId, this.relation, resource.type, resource.id, this.bypassCacheFlag)
			.then((result) => result.allowed);
	}

	onResource(type: TDocTypes[number], id: string): Promise<boolean> {
		return this.executor
			.checkRelation(this.userId, this.relation, type, id, this.bypassCacheFlag)
			.then((result) => result.allowed);
	}
}

export class SubjectGrantBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	private expiresAtValue?: number | null;

	constructor(
		private readonly subject: Subject,
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	expiresAt(timestamp: number | null): this {
		this.expiresAtValue = timestamp;
		return this;
	}

	expiresIn(ms: number): this {
		this.expiresAtValue = Date.now() + ms;
		return this;
	}

	as(relation: TRelations[number]): GrantRelationBuilder<TDocTypes, TRelations, TPermissions> {
		return new GrantRelationBuilder(this.subject, relation, this.executor, this.expiresAtValue);
	}
}

export class GrantRelationBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	constructor(
		private readonly subject: Subject,
		private readonly relation: TRelations[number],
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>,
		private readonly expiresAt?: number | null
	) {}

	on(resource: Resource<TDocTypes[number]>): Promise<{ ok: boolean }> {
		return this.executor.grantRelation(this.subject, this.relation, resource.type, resource.id, this.expiresAt);
	}

	onResource(type: TDocTypes[number], id: string): Promise<{ ok: boolean }> {
		return this.executor.grantRelation(this.subject, this.relation, type, id, this.expiresAt);
	}
}

export class SubjectRevokeBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	constructor(
		private readonly subject: Subject,
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	from(relation: TRelations[number]): RevokeRelationBuilder<TDocTypes, TRelations, TPermissions> {
		return new RevokeRelationBuilder(this.subject, relation, this.executor);
	}
}

export class RevokeRelationBuilder<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	constructor(
		private readonly subject: Subject,
		private readonly relation: TRelations[number],
		private readonly executor: PermissionCheckExecutor<TDocTypes, TRelations, TPermissions>
	) {}

	on(resource: Resource<TDocTypes[number]>): Promise<{ ok: boolean }> {
		return this.executor.revokeRelation(this.subject, this.relation, resource.type, resource.id);
	}

	onResource(type: TDocTypes[number], id: string): Promise<{ ok: boolean }> {
		return this.executor.revokeRelation(this.subject, this.relation, type, id);
	}
}

