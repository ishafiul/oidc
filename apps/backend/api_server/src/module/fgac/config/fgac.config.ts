export const FGAC_CONFIG = {
  docTypes: ['project', 'client', 'scope_set', 'user'] as const,
  relations: ['viewer', 'editor', 'owner', 'member', 'admin'] as const,
  permissions: ['user', 'read', 'write', 'admin', 'superadmin', 'manage_permissions'] as const,
  projectId: 'global',
  
  // Optional: Default relation mappings (auto-applied on first use)
  defaultRelations: {
    viewer: { permissions: ['read'] as const, inherits: [] as const },
    editor: { permissions: ['write'] as const, inherits: ['viewer'] as const },
    member: { permissions: ['user'] as const, inherits: [] as const },
    owner: { permissions: ['admin', 'manage_permissions'] as const, inherits: ['editor'] as const },
    admin: { permissions: ['admin', 'superadmin', 'manage_permissions'] as const, inherits: ['owner'] as const },
  } as const,
  
  // Optional: Auto-grant admin to system admin (default: true)
  autoGrantAdminToSystemAdmin: true,
} as const;

export type FGACConfig = typeof FGAC_CONFIG;

export type FGACDocType = FGACConfig['docTypes'][number];
export type FGACRelation = FGACConfig['relations'][number];
export type FGACPermission = FGACConfig['permissions'][number];

export const FGAC_DOC_TYPES = FGAC_CONFIG.docTypes;
export const FGAC_RELATIONS = FGAC_CONFIG.relations;
export const FGAC_PERMISSIONS = FGAC_CONFIG.permissions;
export const FGAC_PROJECT_ID = FGAC_CONFIG.projectId;
