/**
 * Permission Route DTOs
 *
 * Zod schemas for permission API request/response validation.
 */

import z from 'zod';

// ============================================
// Common Schemas
// ============================================

export const successResponseDto = z.object({
  ok: z.boolean(),
}).meta({
  title: "SuccessResponse",
  description: "Generic success response indicating operation completion",
});

export const resourceDto = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
}).meta({
  title: "Resource",
  description: "Represents a resource with type and identifier",
});

// ============================================
// Relation Definition DTOs
// ============================================

export const defineRelationDto = z.object({
  type: z.string().min(1),
  relation: z.string().min(1),
  permissions: z.array(z.string().min(1)).min(1),
  inherits: z.array(z.string().min(1)).optional(),
}).meta({
  title: "DefineRelationRequest",
  description: "Request to define a new relation with permissions and optional inheritance",
});

export const deleteRelationDto = z.object({
  type: z.string().min(1),
  relation: z.string().min(1),
}).meta({
  title: "DeleteRelationRequest",
  description: "Request to delete a relation definition",
});

export const listRelationsDto = z.object({
  type: z.string().min(1),
}).meta({
  title: "ListRelationsRequest",
  description: "Request to list all relations for a resource type",
});

export const listRelationsResponseDto = z.object({
  relations: z.record(
    z.string(),
    z.object({
      permissions: z.array(z.string()),
      inherits: z.array(z.string()),
    })
  ),
}).meta({
  title: "ListRelationsResponse",
  description: "Response containing all relations for a resource type with their permissions and inheritance",
});

// ============================================
// Grant/Revoke DTOs
// ============================================

export const grantRelationDto = z.object({
  subject: z.string().min(1).regex(/^(user|group|api_key):/, {
    message: 'Subject must start with user:, group:, or api_key:',
  }),
  relation: z.string().min(1),
  resource: resourceDto,
  expiresAt: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      'Unix timestamp in milliseconds when the grant stops applying. Omit or null for no automatic expiry (until revoked).',
    ),
}).meta({
  title: "GrantRelationRequest",
  description:
    'Grant a relation on a resource. expiresAt: optional end time (ms since epoch); omit or null keeps the grant until revoke.',
});

export const revokeRelationDto = z.object({
  subject: z.string().min(1).regex(/^(user|group|api_key):/, {
    message: 'Subject must start with user:, group:, or api_key:',
  }),
  relation: z.string().min(1),
  resource: resourceDto,
}).meta({
  title: "RevokeRelationRequest",
  description: "Request to revoke a relation from a subject for a specific resource",
});

export const batchGrantDto = z.object({
  subject: z.string().min(1).regex(/^(user|group|api_key):/),
  relation: z.string().min(1),
  resources: z.array(resourceDto).min(1),
  expiresAt: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      'Unix timestamp in milliseconds when grants stop applying. Omit or null for no automatic expiry (until revoked).',
    ),
}).meta({
  title: "BatchGrantRequest",
  description:
    'Batch grant the same relation on multiple resources. expiresAt optional; omit or null until revoke.',
});

export const batchRevokeDto = z.object({
  subject: z.string().min(1).regex(/^(user|group|api_key):/),
  relation: z.string().min(1),
  resources: z.array(resourceDto).min(1),
}).meta({
  title: "BatchRevokeRequest",
  description: "Request to revoke a relation from a subject for multiple resources",
});

// ============================================
// User Relation DTOs
// ============================================

export const getUserRelationsDto = z.object({
  userId: z.string().min(1),
  type: z.string().min(1),
}).meta({
  title: "GetUserRelationsRequest",
  description: "Request to get all relations for a user of a specific resource type",
});

export const userRelationEntryDto = z.object({
  type: z.string(),
  id: z.string(),
  relation: z.string(),
  expires_at: z.number().nullable(),
}).meta({
  title: "UserRelationEntry",
  description: "Represents a single relation entry for a user",
});

export const getUserRelationsResponseDto = z.object({
  relations: z.array(userRelationEntryDto),
}).meta({
  title: "GetUserRelationsResponse",
  description: "Response containing all relations for a user",
});

// ============================================
// Group Management DTOs
// ============================================

export const addToGroupDto = z.object({
  user: z.string().min(1),
  group: z.string().min(1),
}).meta({
  title: "AddToGroupRequest",
  description: "Request to add a user to a group",
});

export const removeFromGroupDto = z.object({
  user: z.string().min(1),
  group: z.string().min(1),
}).meta({
  title: "RemoveFromGroupRequest",
  description: "Request to remove a user from a group",
});

export const getGroupMembersDto = z.object({
  group: z.string().min(1),
}).meta({
  title: "GetGroupMembersRequest",
  description: "Request to get all members of a group",
});

export const getGroupRelationsDto = z.object({
  group: z.string().optional(),
}).meta({
  title: "GetGroupRelationsRequest",
  description: "Request to get all relations for a group or all groups",
});

export const listGroupsResponseDto = z.object({
  groups: z.array(z.string()),
}).meta({
  title: "ListGroupsResponse",
  description: "Response containing a list of all group names",
});

export const getGroupMembersResponseDto = z.object({
  users: z.array(z.string()),
}).meta({
  title: "GetGroupMembersResponse",
  description: "Response containing a list of user IDs in a group",
});

export const resourceRelationDto = z.object({
  type: z.string(),
  id: z.string(),
  relation: z.string(),
  expires_at: z.number().nullable().optional(),
}).meta({
  title: "ResourceRelation",
  description: "Represents a relation between a group and a resource",
});

export const getGroupRelationsResponseDto = z.object({
  groups: z.record(z.string(), z.array(resourceRelationDto)),
}).meta({
  title: "GetGroupRelationsResponse",
  description: "Response containing relations for groups mapped by group name",
});

// ============================================
// Permission Check DTOs
// ============================================

export const checkPermissionDto = z.object({
  permission: z.string().min(1),
  resource: resourceDto,
  bypassCache: z.boolean().optional(),
}).meta({
  title: "CheckPermissionRequest",
  description: "Request to check if a user has a specific permission on a resource",
});

export const checkRelationDto = z.object({
  relation: z.string().min(1),
  resource: resourceDto,
  bypassCache: z.boolean().optional(),
}).meta({
  title: "CheckRelationRequest",
  description: "Request to check if a user has a specific relation on a resource",
});

export const batchCheckPermissionsDto = z.object({
  permissions: z.array(z.string().min(1)).min(1),
  resource: resourceDto,
  bypassCache: z.boolean().optional(),
}).meta({
  title: "BatchCheckPermissionsRequest",
  description: "Request to check if a user has multiple permissions on a resource",
});

export const checkResultDto = z.object({
  allowed: z.boolean(),
}).meta({
  title: "CheckResult",
  description: "Generic result indicating whether a permission check is allowed",
});

export const permissionCheckResultDto = z.object({
  allowed: z.boolean(),
  permissions: z.array(z.string()),
  cached: z.boolean().optional(),
}).meta({
  title: "PermissionCheckResult",
  description: "Result of a permission check with list of granted permissions and cache status",
});

export const relationCheckResultDto = z.object({
  allowed: z.boolean(),
  relation: z.string(),
  cached: z.boolean().optional(),
}).meta({
  title: "RelationCheckResult",
  description: "Result of a relation check with the relation name and cache status",
});

export const batchCheckResultDto = z.object({
  results: z.record(z.string(), z.boolean()),
  allAllowed: z.boolean(),
  anyAllowed: z.boolean(),
}).meta({
  title: "BatchCheckResult",
  description: "Result of a batch permission check with individual results and aggregate flags",
});

// ============================================
// Get All Permissions DTOs
// ============================================

export const getAllPermissionsDto = z.object({
  resource: resourceDto,
  bypassCache: z.boolean().optional(),
}).meta({
  title: "GetAllPermissionsRequest",
  description: "Request to get all permissions and relations for a user on a resource",
});

export const getAllPermissionsResponseDto = z.object({
  permissions: z.array(z.string()),
  relations: z.array(z.string()),
}).meta({
  title: "GetAllPermissionsResponse",
  description: "Response containing all permissions and relations for a user on a resource",
});
