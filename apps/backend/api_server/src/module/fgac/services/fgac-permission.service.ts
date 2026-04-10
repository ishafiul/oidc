/**
 * FGAC Permission Service
 *
 * Provides permission checking functionality using the FGAC adapter.
 * This service focuses on permission checking operations only,
 * following the Interface Segregation Principle.
 */

import type {
  FGACConfig,
  IPermissionChecker,
  InferDocType,
  InferRelation,
  InferPermission,
  Resource,
  BatchCanCheckResult,
  GetAllPermissionsResponse,
  PermissionCheckResult,
  RelationCheckResult,
} from '../adapters/IPermissionAdapter';

/**
 * Permission service that delegates to an IPermissionChecker adapter.
 * Provides convenience methods for common permission checking patterns.
 */
export class FGACPermissionService<TConfig extends FGACConfig> implements IPermissionChecker<TConfig> {
  private readonly adapter: IPermissionChecker<TConfig>;
  private readonly globalResourceId = 'global';

  constructor(adapter: IPermissionChecker<TConfig>) {
    this.adapter = adapter;
  }

  /**
   * Create a resource object with optional default ID
   */
  private createResource(
    type: InferDocType<TConfig>,
    id?: string
  ): Resource<InferDocType<TConfig>> {
    return { type, id: id ?? this.globalResourceId };
  }

  // ============================================
  // Core Permission Checking
  // ============================================

  async can(
    userId: string,
    permission: InferPermission<TConfig>,
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<boolean> {
    return this.adapter.can(userId, permission, resource, bypassCache);
  }

  async has(
    userId: string,
    relation: InferRelation<TConfig>,
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<boolean> {
    return this.adapter.has(userId, relation, resource, bypassCache);
  }

  async canAll(
    userId: string,
    permissions: InferPermission<TConfig>[],
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<BatchCanCheckResult<InferPermission<TConfig>>> {
    return this.adapter.canAll(userId, permissions, resource, bypassCache);
  }

  async canAny(
    userId: string,
    permissions: InferPermission<TConfig>[],
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<boolean> {
    return this.adapter.canAny(userId, permissions, resource, bypassCache);
  }

  async getAllPermissions(
    userId: string,
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<GetAllPermissionsResponse<InferPermission<TConfig>>> {
    return this.adapter.getAllPermissions(userId, resource, bypassCache);
  }

  async checkPermission(
    userId: string,
    permission: InferPermission<TConfig>,
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<PermissionCheckResult<InferPermission<TConfig>>> {
    return this.adapter.checkPermission(userId, permission, resource, bypassCache);
  }

  async checkRelation(
    userId: string,
    relation: InferRelation<TConfig>,
    resource: Resource<InferDocType<TConfig>>,
    bypassCache?: boolean
  ): Promise<RelationCheckResult<InferRelation<TConfig>>> {
    return this.adapter.checkRelation(userId, relation, resource, bypassCache);
  }

  // ============================================
  // Convenience Methods (with automatic resource creation)
  // ============================================

  /**
   * Check if user has permission on a resource type with optional ID
   * Uses global resource ID if not specified
   */
  async checkPermissionOnType(
    userId: string,
    permission: InferPermission<TConfig>,
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    const resource = this.createResource(resourceType, resourceId);
    return this.can(userId, permission, resource);
  }

  /**
   * Check if user has relation on a resource type with optional ID
   * Uses global resource ID if not specified
   */
  async checkRelationOnType(
    userId: string,
    relation: InferRelation<TConfig>,
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    const resource = this.createResource(resourceType, resourceId);
    return this.has(userId, relation, resource);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async checkAnyOf(
    userId: string,
    permissions: InferPermission<TConfig>[],
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return false;
    }
    const resource = this.createResource(resourceType, resourceId);
    return this.canAny(userId, permissions, resource);
  }

  /**
   * Check if user has all of the specified permissions
   */
  async checkAllOf(
    userId: string,
    permissions: InferPermission<TConfig>[],
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return false;
    }
    const resource = this.createResource(resourceType, resourceId);
    const result = await this.canAll(userId, permissions, resource);
    return result.allAllowed;
  }

  /**
   * Check if user has any of the specified relations
   */
  async checkAnyRelation(
    userId: string,
    relations: InferRelation<TConfig>[],
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    if (relations.length === 0) {
      return false;
    }
    const resource = this.createResource(resourceType, resourceId);
    const checks = relations.map((relation) =>
      this.has(userId, relation, resource)
    );
    const results = await Promise.all(checks);
    return results.some((allowed) => allowed);
  }

  /**
   * Check if user has all of the specified relations
   */
  async checkAllRelations(
    userId: string,
    relations: InferRelation<TConfig>[],
    resourceType: InferDocType<TConfig>,
    resourceId?: string
  ): Promise<boolean> {
    if (relations.length === 0) {
      return false;
    }
    const resource = this.createResource(resourceType, resourceId);
    const checks = relations.map((relation) =>
      this.has(userId, relation, resource)
    );
    const results = await Promise.all(checks);
    return results.every((allowed) => allowed);
  }
}
