/**
 * Permission Management Service
 *
 * Provides relation definition and grant management functionality.
 * Implements IRelationDefinitionManager, IRelationGrantManager, and IGroupManager.
 */

import type {
  FGACConfig,
  IRelationDefinitionManager,
  IRelationGrantManager,
  IGroupManager,
  IConnectionTester,
  IFGACAdapter,
  InferDocType,
  InferRelation,
  InferPermission,
  Resource,
  Subject,
  SuccessResponse,
  ListRelationsResponse,
  GetUserRelationsResponse,
  ListGroupsResponse,
  GetGroupMembersResponse,
  GetGroupRelationsResponse,
  DefineRelationParams,
} from '../adapters/IPermissionAdapter';
import { AutoInitializerService } from './auto-initializer.service';

/**
 * Combined interface for management operations
 */
export interface IPermissionManagement<TConfig extends FGACConfig>
  extends IRelationDefinitionManager<TConfig>,
  IRelationGrantManager<TConfig>,
  IGroupManager,
  IConnectionTester { }

/**
 * Permission management service that delegates to an IFGACAdapter.
 * Provides methods for defining relations, granting/revoking access, and group management.
 */
export class PermissionManagementService<TConfig extends FGACConfig>
  implements IPermissionManagement<TConfig> {
  private readonly adapter: IFGACAdapter<TConfig>;
  private autoInitializer?: AutoInitializerService<TConfig>;
  private systemAdminUserId?: string;

  constructor(adapter: IFGACAdapter<TConfig>, config?: TConfig, systemAdminUserId?: string) {
    this.adapter = adapter;
    this.systemAdminUserId = systemAdminUserId;
    if (config) {
      this.autoInitializer = new AutoInitializerService(adapter, config);
    }
  }

  /**
   * Ensure system is initialized (lazy auto-initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.autoInitializer) {
      await this.autoInitializer.ensureInitialized(this.systemAdminUserId);
    }
  }

  // ============================================
  // IConnectionTester Implementation
  // ============================================

  async testConnection(): Promise<{ ok: boolean; message: string; hasKV: boolean }> {
    return this.adapter.testConnection();
  }

  // ============================================
  // IRelationDefinitionManager Implementation
  // ============================================

  async defineRelation(params: DefineRelationParams<TConfig>): Promise<SuccessResponse> {
    await this.ensureInitialized();
    return this.adapter.defineRelation(params);
  }

  async deleteRelation(
    type: InferDocType<TConfig>,
    relation: string
  ): Promise<SuccessResponse> {
    return this.adapter.deleteRelation(type, relation);
  }

  async listRelations(
    type: InferDocType<TConfig>
  ): Promise<ListRelationsResponse<InferPermission<TConfig>>> {
    await this.ensureInitialized();
    return this.adapter.listRelations(type);
  }

  // ============================================
  // IRelationGrantManager Implementation
  // ============================================

  async grant(
    subject: Subject,
    relation: InferRelation<TConfig>,
    resource: Resource<InferDocType<TConfig>>,
    expiresAt?: number | null
  ): Promise<SuccessResponse> {
    await this.ensureInitialized();
    return this.adapter.grant(subject, relation, resource, expiresAt);
  }

  async revoke(
    subject: Subject,
    relation: InferRelation<TConfig>,
    resource: Resource<InferDocType<TConfig>>
  ): Promise<SuccessResponse> {
    return this.adapter.revoke(subject, relation, resource);
  }

  async grantToResources(
    subject: Subject,
    relation: InferRelation<TConfig>,
    resources: Resource<InferDocType<TConfig>>[],
    expiresAt?: number | null
  ): Promise<SuccessResponse> {
    return this.adapter.grantToResources(subject, relation, resources, expiresAt);
  }

  async revokeFromResources(
    subject: Subject,
    relation: InferRelation<TConfig>,
    resources: Resource<InferDocType<TConfig>>[]
  ): Promise<SuccessResponse> {
    return this.adapter.revokeFromResources(subject, relation, resources);
  }

  async getUserRelations(
    userId: string,
    type: InferDocType<TConfig>
  ): Promise<GetUserRelationsResponse<InferDocType<TConfig>>> {
    return this.adapter.getUserRelations(userId, type);
  }

  // ============================================
  // IGroupManager Implementation
  // ============================================

  async addToGroup(user: string, group: string): Promise<SuccessResponse> {
    return this.adapter.addToGroup(user, group);
  }

  async removeFromGroup(user: string, group: string): Promise<SuccessResponse> {
    return this.adapter.removeFromGroup(user, group);
  }

  async listGroups(): Promise<ListGroupsResponse> {
    return this.adapter.listGroups();
  }

  async getGroupMembers(group: string): Promise<GetGroupMembersResponse> {
    return this.adapter.getGroupMembers(group);
  }

  async getGroupRelations<TDocType extends string>(
    group?: string
  ): Promise<GetGroupRelationsResponse<TDocType>> {
    return this.adapter.getGroupRelations<TDocType>(group);
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Grant a relation to a user on a resource
   */
  async grantToUser(
    userId: string,
    relation: InferRelation<TConfig>,
    type: InferDocType<TConfig>,
    id: string,
    expiresAt?: number | null
  ): Promise<SuccessResponse> {
    const subject: Subject = `user:${userId}`;
    const resource: Resource<InferDocType<TConfig>> = { type, id };
    return this.grant(subject, relation, resource, expiresAt);
  }

  /**
   * Revoke a relation from a user on a resource
   */
  async revokeFromUser(
    userId: string,
    relation: InferRelation<TConfig>,
    type: InferDocType<TConfig>,
    id: string
  ): Promise<SuccessResponse> {
    const subject: Subject = `user:${userId}`;
    const resource: Resource<InferDocType<TConfig>> = { type, id };
    return this.revoke(subject, relation, resource);
  }

  /**
   * Grant a relation to a group on a resource
   */
  async grantToGroup(
    groupId: string,
    relation: InferRelation<TConfig>,
    type: InferDocType<TConfig>,
    id: string,
    expiresAt?: number | null
  ): Promise<SuccessResponse> {
    const subject: Subject = `group:${groupId}`;
    const resource: Resource<InferDocType<TConfig>> = { type, id };
    return this.grant(subject, relation, resource, expiresAt);
  }

  /**
   * Revoke a relation from a group on a resource
   */
  async revokeFromGroup(
    groupId: string,
    relation: InferRelation<TConfig>,
    type: InferDocType<TConfig>,
    id: string
  ): Promise<SuccessResponse> {
    const subject: Subject = `group:${groupId}`;
    const resource: Resource<InferDocType<TConfig>> = { type, id };
    return this.revoke(subject, relation, resource);
  }

  /**
   * Define a relation with simpler signature
   */
  async defineRelationSimple(
    type: InferDocType<TConfig>,
    relation: string,
    permissions: InferPermission<TConfig>[],
    inherits?: string[]
  ): Promise<SuccessResponse> {
    return this.defineRelation({
      type,
      relation,
      permissions,
      inherits,
    });
  }
}
