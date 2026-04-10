import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { timestamps } from './common.schema';

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdByUserId: text('created_by_user_id').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    fgacCustomDocTypes: text('fgac_custom_doc_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (table) => ({
    slugUnique: uniqueIndex('projects_slug_uq').on(table.slug),
    isActiveIdx: index('projects_is_active_idx').on(table.isActive),
  }),
);

export const insertProjectsSchema = createInsertSchema(projects);
export const selectProjectsSchema = createSelectSchema(projects);
export type SelectProject = z.infer<typeof selectProjectsSchema>;

export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(), // owner | admin | editor | viewer
    isActive: boolean('is_active').notNull().default(true),
    invitedByUserId: text('invited_by_user_id'),
    ...timestamps,
  },
  (table) => ({
    projectUserUnique: uniqueIndex('project_memberships_project_user_uq').on(
      table.projectId,
      table.userId,
    ),
    projectRoleIdx: index('project_memberships_project_role_idx').on(
      table.projectId,
      table.role,
    ),
    projectActiveIdx: index('project_memberships_project_active_idx').on(
      table.projectId,
      table.isActive,
    ),
  }),
);

export const insertProjectMembershipsSchema = createInsertSchema(projectMemberships);
export const selectProjectMembershipsSchema = createSelectSchema(projectMemberships);
export type SelectProjectMembership = z.infer<typeof selectProjectMembershipsSchema>;

export const projectInvitations = pgTable(
  'project_invitations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    ...timestamps,
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('project_invitations_token_hash_uq').on(table.tokenHash),
    projectEmailIdx: index('project_invitations_project_email_idx').on(table.projectId, table.email),
  }),
);

export const insertProjectInvitationsSchema = createInsertSchema(projectInvitations);
export const selectProjectInvitationsSchema = createSelectSchema(projectInvitations);
export type SelectProjectInvitation = z.infer<typeof selectProjectInvitationsSchema>;

export const projectApiKeys = pgTable(
	'project_api_keys',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text('name').notNull().default(''),
		keyPrefix: text('key_prefix').notNull(),
		keyHash: text('key_hash').notNull(),
		scopes: text('scopes')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		revokedAt: timestamp('revoked_at'),
		lastUsedAt: timestamp('last_used_at'),
		createdByUserId: text('created_by_user_id').notNull(),
		...timestamps,
	},
	(table) => ({
		keyHashUnique: uniqueIndex('project_api_keys_key_hash_uq').on(table.keyHash),
		projectIdx: index('project_api_keys_project_id_idx').on(table.projectId),
	}),
);

export const insertProjectApiKeysSchema = createInsertSchema(projectApiKeys);
export const selectProjectApiKeysSchema = createSelectSchema(projectApiKeys);
export type SelectProjectApiKey = z.infer<typeof selectProjectApiKeysSchema>;

export const oidcScopeSets = pgTable(
  'oidc_scope_sets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    projectNameUnique: uniqueIndex('oidc_scope_sets_project_name_uq').on(table.projectId, table.name),
    projectActiveIdx: index('oidc_scope_sets_project_active_idx').on(table.projectId, table.isActive),
  }),
);

export const insertOidcScopeSetsSchema = createInsertSchema(oidcScopeSets);
export const selectOidcScopeSetsSchema = createSelectSchema(oidcScopeSets);
export type SelectOidcScopeSet = z.infer<typeof selectOidcScopeSetsSchema>;

export const oidcScopeSetScopes = pgTable(
  'oidc_scope_set_scopes',
  {
    id: text('id').primaryKey(),
    scopeSetId: text('scope_set_id').notNull(),
    scope: text('scope').notNull(),
    ...timestamps,
  },
  (table) => ({
    scopeSetScopeUnique: uniqueIndex('oidc_scope_set_scopes_scope_set_scope_uq').on(
      table.scopeSetId,
      table.scope,
    ),
    scopeSetIdx: index('oidc_scope_set_scopes_scope_set_idx').on(table.scopeSetId),
  }),
);

export const insertOidcScopeSetScopesSchema = createInsertSchema(oidcScopeSetScopes);
export const selectOidcScopeSetScopesSchema = createSelectSchema(oidcScopeSetScopes);
export type SelectOidcScopeSetScope = z.infer<typeof selectOidcScopeSetScopesSchema>;

export const oidcClients = pgTable(
  'oidc_clients',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    clientId: text('client_id').notNull(),
    clientSecret: text('client_secret'),
    name: text('name').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    projectClientUnique: uniqueIndex('oidc_clients_project_client_uq').on(table.projectId, table.clientId),
    projectActiveIdx: index('oidc_clients_project_active_idx').on(table.projectId, table.isActive),
  }),
);

export const insertOidcClientsSchema = createInsertSchema(oidcClients);
export const selectOidcClientsSchema = createSelectSchema(oidcClients);
export type SelectOidcClient = z.infer<typeof selectOidcClientsSchema>;

export const oidcClientRedirectUris = pgTable(
  'oidc_client_redirect_uris',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    ...timestamps,
  },
  (table) => ({
    clientRedirectUnique: uniqueIndex('oidc_client_redirect_uris_client_uri_uq').on(
      table.clientId,
      table.redirectUri,
    ),
    clientIdx: index('oidc_client_redirect_uris_client_idx').on(table.clientId),
  }),
);

export const insertOidcClientRedirectUrisSchema = createInsertSchema(oidcClientRedirectUris);
export const selectOidcClientRedirectUrisSchema = createSelectSchema(oidcClientRedirectUris);
export type SelectOidcClientRedirectUri = z.infer<typeof selectOidcClientRedirectUrisSchema>;

export const oidcClientScopeSets = pgTable(
  'oidc_client_scope_sets',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull(),
    scopeSetId: text('scope_set_id').notNull(),
    ...timestamps,
  },
  (table) => ({
    clientScopeSetUnique: uniqueIndex('oidc_client_scope_sets_client_scope_set_uq').on(
      table.clientId,
      table.scopeSetId,
    ),
    clientIdx: index('oidc_client_scope_sets_client_idx').on(table.clientId),
    scopeSetIdx: index('oidc_client_scope_sets_scope_set_idx').on(table.scopeSetId),
  }),
);

export const insertOidcClientScopeSetsSchema = createInsertSchema(oidcClientScopeSets);
export const selectOidcClientScopeSetsSchema = createSelectSchema(oidcClientScopeSets);
export type SelectOidcClientScopeSet = z.infer<typeof selectOidcClientScopeSetsSchema>;

export const oidcAuthorizationCodes = pgTable(
  'oidc_authorization_codes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    code: text('code').notNull(),
    clientId: text('client_id').notNull(),
    userId: text('user_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    nonce: text('nonce'),
    codeChallenge: text('code_challenge'),
    codeChallengeMethod: text('code_challenge_method'),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    ...timestamps,
  },
  (table) => ({
    codeUnique: uniqueIndex('oidc_authorization_codes_code_uq').on(table.code),
    projectClientIdx: index('oidc_authorization_codes_project_client_idx').on(table.projectId, table.clientId),
  }),
);

export const insertOidcAuthorizationCodesSchema = createInsertSchema(oidcAuthorizationCodes);
export const selectOidcAuthorizationCodesSchema = createSelectSchema(oidcAuthorizationCodes);
export type SelectOidcAuthorizationCode = z.infer<typeof selectOidcAuthorizationCodesSchema>;

export const oidcAuthorizeSessions = pgTable(
  'oidc_authorize_sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    ...timestamps,
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('oidc_authorize_sessions_token_hash_uq').on(table.tokenHash),
    userIdIdx: index('oidc_authorize_sessions_user_id_idx').on(table.userId),
  }),
);

export const insertOidcAuthorizeSessionsSchema = createInsertSchema(oidcAuthorizeSessions);
export const selectOidcAuthorizeSessionsSchema = createSelectSchema(oidcAuthorizeSessions);
export type SelectOidcAuthorizeSession = z.infer<typeof selectOidcAuthorizeSessionsSchema>;

export const oidcRefreshTokens = pgTable(
  'oidc_refresh_tokens',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    clientId: text('client_id').notNull(),
    userId: text('user_id').notNull(),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    ...timestamps,
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('oidc_refresh_tokens_token_hash_uq').on(table.tokenHash),
    projectClientIdx: index('oidc_refresh_tokens_project_client_idx').on(table.projectId, table.clientId),
  }),
);

export const insertOidcRefreshTokensSchema = createInsertSchema(oidcRefreshTokens);
export const selectOidcRefreshTokensSchema = createSelectSchema(oidcRefreshTokens);
export type SelectOidcRefreshToken = z.infer<typeof selectOidcRefreshTokensSchema>;

export const oidcSigningKeys = pgTable(
  'oidc_signing_keys',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    kid: text('kid').notNull(),
    algorithm: text('algorithm').notNull().default('RS256'),
    publicJwk: text('public_jwk').notNull(),
    privateJwk: text('private_jwk').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    projectKidUnique: uniqueIndex('oidc_signing_keys_project_kid_uq').on(table.projectId, table.kid),
    projectActiveIdx: index('oidc_signing_keys_project_active_idx').on(table.projectId, table.isActive),
  }),
);

export const insertOidcSigningKeysSchema = createInsertSchema(oidcSigningKeys);
export const selectOidcSigningKeysSchema = createSelectSchema(oidcSigningKeys);
export type SelectOidcSigningKey = z.infer<typeof selectOidcSigningKeysSchema>;
