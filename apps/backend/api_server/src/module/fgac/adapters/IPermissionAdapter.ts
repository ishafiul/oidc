/**
 * FGAC Permission Adapter Interfaces
 * 
 * Following SOLID principles:
 * - Interface Segregation: Separate interfaces for checking, management, and groups
 * - Dependency Inversion: Services depend on these abstractions, not concrete implementations
 * - Open/Closed: New adapters can be created without modifying existing code
 */

import type {
    Subject,
    Resource,
    SuccessResponse,
    ListRelationsResponse,
    ListGroupsResponse,
    GetGroupMembersResponse,
    GetGroupRelationsResponse,
    GetUserRelationsResponse,
    BatchCanCheckResult,
    GetAllPermissionsResponse,
    RelationDefinition,
} from 'permission-manager-worker/src';

/**
 * Configuration interface for FGAC system.
 * Uses readonly tuple types for full type inference.
 */
export interface FGACConfig {
    readonly docTypes: readonly [string, ...string[]];
    readonly relations: readonly [string, ...string[]];
    readonly permissions: readonly [string, ...string[]];
    readonly projectId: string;
}

/**
 * Infer doc type from config
 */
export type InferDocType<T extends FGACConfig> = T['docTypes'][number];

/**
 * Infer relation from config
 */
export type InferRelation<T extends FGACConfig> = T['relations'][number];

/**
 * Infer permission from config
 */
export type InferPermission<T extends FGACConfig> = T['permissions'][number];

/**
 * Permission check result with relation info
 */
export interface PermissionCheckResult<TPermission extends string = string> {
    readonly allowed: boolean;
    readonly permissions: TPermission[];
    readonly cached?: boolean;
}

/**
 * Relation check result
 */
export interface RelationCheckResult<TRelation extends string = string> {
    readonly allowed: boolean;
    readonly relation: TRelation;
    readonly cached?: boolean;
}

/**
 * Interface for permission checking operations.
 * Follows Interface Segregation Principle - only checking methods.
 */
export interface IPermissionChecker<TConfig extends FGACConfig> {
    /**
     * Check if user has a specific permission on a resource
     */
    can(
        userId: string,
        permission: InferPermission<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean>;

    /**
     * Check if user has a specific relation with a resource
     */
    has(
        userId: string,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean>;

    /**
     * Check multiple permissions and get detailed results
     */
    canAll(
        userId: string,
        permissions: InferPermission<TConfig>[],
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<BatchCanCheckResult<InferPermission<TConfig>>>;

    /**
     * Check if user has any of the specified permissions
     */
    canAny(
        userId: string,
        permissions: InferPermission<TConfig>[],
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<boolean>;

    /**
     * Get all permissions a user has on a resource
     */
    getAllPermissions(
        userId: string,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<GetAllPermissionsResponse<InferPermission<TConfig>>>;

    /**
     * Check permission with full result details
     */
    checkPermission(
        userId: string,
        permission: InferPermission<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<PermissionCheckResult<InferPermission<TConfig>>>;

    /**
     * Check relation with full result details
     */
    checkRelation(
        userId: string,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        bypassCache?: boolean
    ): Promise<RelationCheckResult<InferRelation<TConfig>>>;
}

/**
 * Define relation request
 */
export interface DefineRelationParams<TConfig extends FGACConfig> {
    readonly type: InferDocType<TConfig>;
    readonly relation: string;
    readonly permissions: InferPermission<TConfig>[];
    readonly inherits?: string[];
}

/**
 * Interface for relation definition management.
 * Follows Interface Segregation Principle - only schema definition methods.
 */
export interface IRelationDefinitionManager<TConfig extends FGACConfig> {
    /**
     * Define a new relation with its permissions and inheritance
     */
    defineRelation(params: DefineRelationParams<TConfig>): Promise<SuccessResponse>;

    /**
     * Delete a relation definition
     */
    deleteRelation(
        type: InferDocType<TConfig>,
        relation: string
    ): Promise<SuccessResponse>;

    /**
     * List all relation definitions for a resource type
     */
    listRelations(
        type: InferDocType<TConfig>
    ): Promise<ListRelationsResponse<InferPermission<TConfig>>>;
}

/**
 * Interface for granting and revoking relations.
 * Follows Interface Segregation Principle - only grant/revoke methods.
 */
export interface IRelationGrantManager<TConfig extends FGACConfig> {
    /**
     * Grant a relation to a subject on a resource
     */
    grant(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>,
        expiresAt?: number | null
    ): Promise<SuccessResponse>;

    /**
     * Revoke a relation from a subject on a resource
     */
    revoke(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resource: Resource<InferDocType<TConfig>>
    ): Promise<SuccessResponse>;

    /**
     * Grant a relation to multiple resources at once
     */
    grantToResources(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resources: Resource<InferDocType<TConfig>>[],
        expiresAt?: number | null
    ): Promise<SuccessResponse>;

    /**
     * Revoke a relation from multiple resources at once
     */
    revokeFromResources(
        subject: Subject,
        relation: InferRelation<TConfig>,
        resources: Resource<InferDocType<TConfig>>[]
    ): Promise<SuccessResponse>;

    /**
     * Get all relations a user has for a resource type
     */
    getUserRelations(
        userId: string,
        type: InferDocType<TConfig>
    ): Promise<GetUserRelationsResponse<InferDocType<TConfig>>>;
}

/**
 * Interface for group management operations.
 * Follows Interface Segregation Principle - only group methods.
 */
export interface IGroupManager {
    /**
     * Add a user to a group
     */
    addToGroup(user: string, group: string): Promise<SuccessResponse>;

    /**
     * Remove a user from a group
     */
    removeFromGroup(user: string, group: string): Promise<SuccessResponse>;

    /**
     * List all groups
     */
    listGroups(): Promise<ListGroupsResponse>;

    /**
     * Get all members of a group
     */
    getGroupMembers(group: string): Promise<GetGroupMembersResponse>;

    /**
     * Get relations for a specific group or all groups
     */
    getGroupRelations<TDocType extends string>(
        group?: string
    ): Promise<GetGroupRelationsResponse<TDocType>>;
}

/**
 * Interface for connection testing
 */
export interface IConnectionTester {
    /**
     * Test the connection to the FGAC service
     */
    testConnection(): Promise<{ ok: boolean; message: string; hasKV: boolean }>;
}

/**
 * Combined adapter interface for full FGAC functionality.
 * Composes all specific interfaces.
 */
export interface IFGACAdapter<TConfig extends FGACConfig>
    extends IPermissionChecker<TConfig>,
    IRelationDefinitionManager<TConfig>,
    IRelationGrantManager<TConfig>,
    IGroupManager,
    IConnectionTester { }

/**
 * Re-export worker types for convenience
 */
export type {
    Subject,
    Resource,
    SuccessResponse,
    ListRelationsResponse,
    ListGroupsResponse,
    GetGroupMembersResponse,
    GetGroupRelationsResponse,
    GetUserRelationsResponse,
    BatchCanCheckResult,
    GetAllPermissionsResponse,
    RelationDefinition,
};
