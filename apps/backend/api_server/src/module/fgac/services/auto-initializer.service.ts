/**
 * Auto-Initializer Service
 *
 * Handles lazy auto-initialization of default relations and system admin.
 * This eliminates the need for manual bootstrap steps.
 */

import type {
  FGACConfig,
  InferDocType,
  InferRelation,
  InferPermission,
  IFGACAdapter,
  GetUserRelationsResponse,
  Subject,
} from '../adapters/IPermissionAdapter';

const fgacSeedCompletedByProject = new Set<string>();
const fgacSeedInflightByProject = new Map<string, Promise<void>>();

/**
 * Default relation definition
 */
interface DefaultRelationDef {
  permissions: readonly string[];
  inherits: readonly string[];
}

/**
 * Extended config with optional auto-initialization properties
 */
interface ExtendedFGACConfig<TConfig extends FGACConfig> extends FGACConfig {
  defaultRelations?: Record<string, DefaultRelationDef>;
  autoGrantAdminToSystemAdmin?: boolean;
}

/**
 * Auto-initializer service for lazy initialization of permissions
 */
export class AutoInitializerService<TConfig extends FGACConfig> {
  private readonly adapter: IFGACAdapter<TConfig>;
  private readonly config: TConfig;
  private readonly projectId: string;
  private readonly globalResourceType: InferDocType<TConfig>;
  private readonly globalResourceId = 'global';

  constructor(
    adapter: IFGACAdapter<TConfig>,
    config: TConfig
  ) {
    this.adapter = adapter;
    this.config = config;
    this.projectId = config.projectId;
    this.globalResourceType = config.docTypes[0] as InferDocType<TConfig>;
  }

  /**
   * Ensure the system is initialized (idempotent)
   */
  async ensureInitialized(systemAdminUserId?: string): Promise<void> {
    if (!fgacSeedCompletedByProject.has(this.projectId)) {
      let p = fgacSeedInflightByProject.get(this.projectId);
      if (!p) {
        p = (async () => {
          await this.runSeedPhase();
          fgacSeedCompletedByProject.add(this.projectId);
        })();
        fgacSeedInflightByProject.set(this.projectId, p);
      }
      try {
        await p;
      } catch (error) {
        fgacSeedInflightByProject.delete(this.projectId);
        throw error;
      }
      fgacSeedInflightByProject.delete(this.projectId);
    }

    if (systemAdminUserId) {
      await this.grantSystemAdminIfNeeded(systemAdminUserId);
    }
  }

  private async runSeedPhase(): Promise<void> {
    const existingRelationsResult = await this.adapter.listRelations(this.globalResourceType);

    if (existingRelationsResult.relations && Object.keys(existingRelationsResult.relations).length > 0) {
      return;
    }

    await this.seedDefaultRelationsForAllDocTypes();
  }

  private async seedDefaultRelationsForAllDocTypes(): Promise<void> {
    const defaults = this.getDefaultRelations();
    const docTypes = this.config.docTypes as readonly string[];

    for (const type of docTypes) {
      for (const [relation, def] of Object.entries(defaults)) {
        if (!this.hasRelation(relation)) {
          continue;
        }

        const validPermissions = def.permissions.filter((p) => this.hasPermission(p));
        if (validPermissions.length === 0) {
          continue;
        }

        const validInherits = def.inherits.filter((r) => this.hasRelation(r));

        try {
          await this.adapter.defineRelation({
            type: type as InferDocType<TConfig>,
            relation,
            permissions: validPermissions as InferPermission<TConfig>[],
            inherits: validInherits,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('already exists') && !errorMessage.includes('duplicate')) {
            throw error;
          }
        }
      }
    }
  }

  /**
   * Get default relations from config or derive them
   */
  private getDefaultRelations(): Record<string, DefaultRelationDef> {
    const extendedConfig = this.config as ExtendedFGACConfig<TConfig>;
    const configDefaults = extendedConfig.defaultRelations;
    if (configDefaults && typeof configDefaults === 'object') {
      return configDefaults;
    }

    return this.deriveDefaultRelations();
  }

  /**
   * Derive default relations from config (fallback logic)
   */
  private deriveDefaultRelations(): Record<string, DefaultRelationDef> {
    const defaults: Record<string, DefaultRelationDef> = {};

    // Viewer relation
    if (this.hasRelation('viewer') && this.hasPermission('read')) {
      defaults.viewer = { permissions: ['read'], inherits: [] };
    }

    // Editor relation (inherits viewer)
    if (this.hasRelation('editor') && this.hasPermission('read') && this.hasPermission('write')) {
      defaults.editor = {
        permissions: ['read', 'write'],
        inherits: this.hasRelation('viewer') ? ['viewer'] : [],
      };
    }

    // Member relation
    if (this.hasRelation('member') && this.hasPermission('user')) {
      defaults.member = { permissions: ['user'], inherits: [] };
    }

    // Owner relation (inherits editor)
    if (this.hasRelation('owner') && this.hasPermission('admin')) {
      const ownerPermissions = this.filterPermissions(['read', 'write', 'admin']);
      defaults.owner = {
        permissions: ownerPermissions,
        inherits: this.hasRelation('editor') ? ['editor'] : [],
      };
    }

    // Admin relation (inherits owner)
    if (this.hasRelation('admin')) {
      const adminPermissions = this.filterPermissions(['user', 'read', 'write', 'admin', 'superadmin']);
      defaults.admin = {
        permissions: adminPermissions,
        inherits: this.hasRelation('owner') ? ['owner'] : [],
      };
    }

    return defaults;
  }

  /**
   * Grant admin permissions to system admin user if needed
   */
  private async grantSystemAdminIfNeeded(systemAdminUserId: string): Promise<void> {
    const extendedConfig = this.config as ExtendedFGACConfig<TConfig>;
    const autoGrant = extendedConfig.autoGrantAdminToSystemAdmin ?? true;

    if (!autoGrant) {
      return;
    }

    const relations = await this.adapter.getUserRelations(
      systemAdminUserId,
      this.globalResourceType
    );

    const hasAdmin = relations.relations.some(
      (r: GetUserRelationsResponse<InferDocType<TConfig>>['relations'][number]) =>
        r.relation === 'admin' &&
        r.id === this.globalResourceId &&
        r.type === this.globalResourceType
    );

    if (!hasAdmin) {
      try {
        const subject: Subject = `user:${systemAdminUserId}`;
        await this.adapter.grant(
          subject,
          'admin' as InferRelation<TConfig>,
          { type: this.globalResourceType, id: this.globalResourceId },
          undefined
        );
      } catch (error) {
        // Ignore errors if already granted (idempotency)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('already') && !errorMessage.includes('duplicate')) {
          throw error;
        }
      }
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private hasRelation(relation: string): boolean {
    return (this.config.relations as readonly string[]).includes(relation);
  }

  private hasPermission(permission: string): boolean {
    return (this.config.permissions as readonly string[]).includes(permission);
  }

  private filterPermissions(names: string[]): string[] {
    return names.filter((name) => this.hasPermission(name));
  }
}

