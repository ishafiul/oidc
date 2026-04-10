
import { z } from 'zod';
import { SubjectSchema, ObjectIdSchema, RelationSchema } from '../entity/schema';
import { RelationDefinition, Resource, Subject } from '../entity/types';

export function createDefineRelationRequestSchema<
	TDocType extends z.ZodType<string>,
	TPermission extends z.ZodType<string>,
>(docTypeSchema: TDocType, permissionSchema: TPermission) {
	return z.object({
		type: docTypeSchema,
		relation: RelationSchema,
		permissions: z.array(permissionSchema),
		inherits: z.array(RelationSchema).optional().default([]),
	}).meta({
		title: "DefineRelationRequest",
		description: "Request to define a new relation with permissions and optional inheritance",
	});
}

export function createGrantRelationRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		subject: SubjectSchema,
		relation: RelationSchema,
		type: docTypeSchema,
		id: ObjectIdSchema,
		expires_at: z.number().nullable().optional().default(null),
	}).meta({
		title: "GrantRelationRequest",
		description: "Request to grant a relation to a subject for a specific resource",
	});
}

export function createRevokeRelationRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		subject: SubjectSchema,
		relation: RelationSchema,
		type: docTypeSchema,
		id: ObjectIdSchema,
	}).meta({
		title: "RevokeRelationRequest",
		description: "Request to revoke a relation from a subject for a specific resource",
	});
}

export function createCheckRelationRequestSchema<
	TDocType extends z.ZodType<string>,
	TRelation extends z.ZodType<string>,
>(docTypeSchema: TDocType, relationSchema: TRelation) {
	return z.object({
	user: z.string().min(1),
		relation: relationSchema,
		type: docTypeSchema,
		id: ObjectIdSchema,
		bypassCache: z.boolean().optional().default(false),
}).meta({
		title: "CheckRelationRequest",
		description: "Request to check if a user has a specific relation on a resource",
	});
}

export function createCheckPermissionRequestSchema<
	TDocType extends z.ZodType<string>,
	TPerm extends z.ZodType<string>,
>(docTypeSchema: TDocType, permissionSchema: TPerm) {
	return z.object({
		user: z.string().min(1),
		type: docTypeSchema,
		id: ObjectIdSchema,
		permission: permissionSchema,
		bypassCache: z.boolean().optional().default(false),
	}).meta({
		title: "CheckPermissionRequest",
		description: "Request to check if a user has a specific permission on a resource",
	});
}

export const GroupMembershipRequestSchema = z.object({
	user: z.string().min(1),
	group: z.string().min(1),
}).meta({
	title: "GroupMembershipRequest",
	description: "Request to manage group membership (add or remove user from group)",
});

export function createListRelationsRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		type: docTypeSchema,
	}).meta({
		title: "ListRelationsRequest",
		description: "Request to list all relations for a resource type",
	});
}

export function createDeleteRelationRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		type: docTypeSchema,
		relation: RelationSchema,
	}).meta({
		title: "DeleteRelationRequest",
		description: "Request to delete a relation definition",
	});
}

export const GetGroupMembersRequestSchema = z.object({
	group: z.string().min(1),
}).meta({
	title: "GetGroupMembersRequest",
	description: "Request to get all members of a group",
});

export const GetGroupRelationsRequestSchema = z.object({
	group: z.string().optional(),
}).meta({
	title: "GetGroupRelationsRequest",
	description: "Request to get all relations for a group or all groups",
});

export function createGrantRelationToMultipleRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		subject: SubjectSchema,
		relation: RelationSchema,
		type: docTypeSchema,
		ids: z.array(ObjectIdSchema),
		expires_at: z.number().nullable().optional().default(null),
	}).meta({
		title: "GrantRelationToMultipleRequest",
		description: "Request to grant a relation to a subject for multiple resources",
	});
}

export function createGetUserRelationsRequestSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		user: z.string().min(1),
		type: docTypeSchema,
	}).meta({
		title: "GetUserRelationsRequest",
		description: "Request to get all relations for a user of a specific resource type",
	});
}

export const RelationResultSchema = z.object({
	allowed: z.boolean(),
	relation: z.string(),
	cached: z.boolean().optional(),
}).meta({
	title: "RelationResult",
	description: "Result of a relation check with the relation name and cache status",
});

export const PermissionResultSchema = z.object({
	allowed: z.boolean(),
	permissions: z.array(z.string()),
	cached: z.boolean().optional(),
}).meta({
	title: "PermissionResult",
	description: "Result of a permission check with list of granted permissions and cache status",
});

export const SuccessResponseSchema = z.object({
	ok: z.boolean(),
}).meta({
	title: "SuccessResponse",
	description: "Generic success response indicating operation completion",
});

export function createListRelationsResponseSchema(permissionSchema: z.ZodType<string>) {
	return z.object({
		relations: z.record(
			z.string(),
			z.object({
				permissions: z.array(permissionSchema),
				inherits: z.array(RelationSchema),
			})
		),
	}).meta({
		title: "ListRelationsResponse",
		description: "Response containing all relations for a resource type with their permissions and inheritance",
	});
}

export const ListGroupsResponseSchema = z.object({
	groups: z.array(z.string()),
}).meta({
	title: "ListGroupsResponse",
	description: "Response containing a list of all group names",
});

export const GetGroupMembersResponseSchema = z.object({
	users: z.array(z.string()),
}).meta({
	title: "GetGroupMembersResponse",
	description: "Response containing a list of user IDs in a group",
});

export function createResourceRelationSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		type: docTypeSchema,
		id: z.string(),
		relation: z.string(),
		expires_at: z.number().nullable().optional(),
	}).meta({
		title: "ResourceRelation",
		description: "Represents a relation between a group and a resource",
	});
}

export function createGetGroupRelationsResponseSchema<T extends z.ZodType<string>>(
	docTypeSchema: T
) {
	return z.object({
		groups: z.record(z.string(), z.array(createResourceRelationSchema(docTypeSchema))),
	}).meta({
		title: "GetGroupRelationsResponse",
		description: "Response containing relations for groups mapped by group name",
	});
}

export type DefineRelationRequest<
	TDocType extends string = string,
	TPermission extends string = string,
> = {
	type: TDocType;
	relation: string;
	permissions: TPermission[];
	inherits?: string[];
};

export type GrantRelationRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	type: TDocType;
	id: string;
	expires_at?: number | null;
};

export type RevokeRelationRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	type: TDocType;
	id: string;
};

export type CheckRelationRequest<
	TDocType extends string = string,
	TRelation extends string = string,
> = {
	user: string;
	relation: TRelation;
	type: TDocType;
	id: string;
	bypassCache?: boolean;
};

export type CheckPermissionRequest<
	TDocType extends string = string,
	TPermission extends string = string,
> = {
	user: string;
	type: TDocType;
	id: string;
	permission: TPermission;
	bypassCache?: boolean;
};

export type GroupMembershipRequest = z.infer<typeof GroupMembershipRequestSchema>;

export type ListRelationsRequest<TDocType extends string = string> = {
	type: TDocType;
};

export type DeleteRelationRequest<TDocType extends string = string> = {
	type: TDocType;
	relation: string;
};

export type GetGroupMembersRequest = z.infer<typeof GetGroupMembersRequestSchema>;
export type GetGroupRelationsRequest = z.infer<typeof GetGroupRelationsRequestSchema>;

export type GrantRelationToMultipleRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	type: TDocType;
	ids: string[];
	expires_at?: number | null;
};

export type GetUserRelationsRequest<TDocType extends string = string> = {
	user: string;
	type: TDocType;
};

export type RelationResult = z.infer<typeof RelationResultSchema>;
export type PermissionResult = z.infer<typeof PermissionResultSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

export type ListRelationsResponse<TPermission extends string = string> = {
	relations: Record<string, RelationDefinition<TPermission>>;
};

export type ListGroupsResponse = z.infer<typeof ListGroupsResponseSchema>;
export type GetGroupMembersResponse = z.infer<typeof GetGroupMembersResponseSchema>;

export type ResourceRelation<TDocType extends string = string> = {
	type: TDocType;
	id: string;
	relation: string;
	expires_at?: number | null;
};

export type GetGroupRelationsResponse<TDocType extends string = string> = {
	groups: Record<string, ResourceRelation<TDocType>[]>;
};

export type UserRelationEntry<TDocType extends string = string> = {
	type: TDocType;
	id: string;
	relation: string;
	expires_at: number | null;
};

export type GetUserRelationsResponse<TDocType extends string = string> = {
	relations: UserRelationEntry<TDocType>[];
};

export type CanCheckRequest<
	TDocType extends string = string,
	TPermission extends string = string,
> = {
	userId: string;
	permission: TPermission;
	resource: Resource<TDocType>;
	bypassCache?: boolean;
};

export type HasRelationRequest<
	TDocType extends string = string,
	TRelation extends string = string,
> = {
	userId: string;
	relation: TRelation;
	resource: Resource<TDocType>;
	bypassCache?: boolean;
};

export type GrantRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	resource: Resource<TDocType>;
	expiresAt?: number | null;
};

export type RevokeRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	resource: Resource<TDocType>;
};

export type BatchCanCheckRequest<
	TDocType extends string = string,
	TPermission extends string = string,
> = {
	userId: string;
	permissions: TPermission[];
	resource: Resource<TDocType>;
	bypassCache?: boolean;
};

export type BatchCanCheckResult<TPermission extends string = string> = {
	results: Record<TPermission, boolean>;
	allAllowed: boolean;
	anyAllowed: boolean;
};

export type BatchGrantRequest<TDocType extends string = string> = {
	subject: Subject;
	relation: string;
	resources: Resource<TDocType>[];
	expiresAt?: number | null;
};

export type GetAllPermissionsRequest<TDocType extends string = string> = {
	userId: string;
	resource: Resource<TDocType>;
	bypassCache?: boolean;
};

export type GetAllPermissionsResponse<TPermission extends string = string> = {
	permissions: TPermission[];
	relations: string[];
};
