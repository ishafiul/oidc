import { ORPCError } from '@orpc/server';
import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import type { Subject } from '../fgac/adapters/IPermissionAdapter';
import {
	createPermissionManagementService,
	type PermissionServiceEnv,
} from '../fgac/services/permission-service.factory';
import { Resend } from 'resend';
import type { DB } from '../../core/db';
import {
	oidcClientRedirectUris,
	oidcClients,
	oidcClientScopeSets,
	oidcScopeSetScopes,
	oidcScopeSets,
	projectApiKeys,
	projectInvitations,
	projectMemberships,
	projects,
} from '../../core/db/schema';
import type { Env } from '../../core/context';
import { PROJECT_API_KEY_PREFIX, type ProjectRole } from './dto';
import {
	buildProjectFgacConfig,
	listMergedFgacDocTypes,
	normalizeFgacCustomDocTypeName,
	PROJECT_FGAC_RELATIONS,
	SYSTEM_FGAC_DOC_TYPES,
} from '../permissions/project-fgac';
import { normalizeRedirectUri } from '../oidc/redirect-uri';

const ROLE_RANK: Record<ProjectRole, number> = {
	viewer: 1,
	editor: 2,
	admin: 3,
	owner: 4,
};

const DEFAULT_SCOPE_SET_NAME = 'default';
const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const;

type ProjectAccess = {
	project: typeof projects.$inferSelect;
	role: ProjectRole;
};

function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function assertRoleAtLeast(actual: ProjectRole, required: ProjectRole): void {
	if (ROLE_RANK[actual] < ROLE_RANK[required]) {
		throw new ORPCError('FORBIDDEN', {
			message: `Requires ${required} role`,
		});
	}
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function randomToken(size = 32): string {
	const bytes = new Uint8Array(size);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

export class ProjectsService {
	constructor(
		private readonly db: DB,
		private readonly env: Env,
	) {}

	private async loadFgacConfig(projectId: string) {
		const row = await this.db.query.projects.findFirst({
			where: (t, { eq: eqFn }) => eqFn(t.id, projectId),
			columns: { id: true, fgacCustomDocTypes: true },
		});
		if (!row) {
			throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
		}
		return buildProjectFgacConfig(row.id, row.fgacCustomDocTypes);
	}

	private permissionManagementFromConfig(config: ReturnType<typeof buildProjectFgacConfig>) {
		return createPermissionManagementService(
			this.env as unknown as PermissionServiceEnv<typeof config>,
			config,
		);
	}

	private async permissionService(projectId: string) {
		const config = await this.loadFgacConfig(projectId);
		return this.permissionManagementFromConfig(config);
	}

	private async seedFgacDefaultsForDocType(projectId: string, docType: string): Promise<void> {
		const config = await this.loadFgacConfig(projectId);
		if (!(config.docTypes as readonly string[]).includes(docType)) {
			return;
		}
		const management = this.permissionManagementFromConfig(config);
		for (const relation of PROJECT_FGAC_RELATIONS) {
			const def = config.defaultRelations[relation];
			try {
				await management.defineRelation({
					type: docType as (typeof config.docTypes)[number],
					relation,
					permissions: [...def.permissions],
					inherits: [...def.inherits],
				});
			} catch {
				// idempotent with existing definitions
			}
		}
	}

	async addFgacCustomDocType(projectId: string, rawName: string) {
		const name = normalizeFgacCustomDocTypeName(rawName);
		if (!name) {
			throw new ORPCError('BAD_REQUEST', {
				message:
					'Invalid doc type name (lowercase a-z, digits, underscore; must start with a letter; max 64 chars)',
			});
		}
		if ((SYSTEM_FGAC_DOC_TYPES as readonly string[]).includes(name)) {
			throw new ORPCError('BAD_REQUEST', { message: 'That name is reserved for system doc types' });
		}
		const row = await this.db.query.projects.findFirst({
			where: (t, { eq: eqFn }) => eqFn(t.id, projectId),
		});
		if (!row) {
			throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
		}
		const current = [...(row.fgacCustomDocTypes ?? [])];
		if (current.some((x) => normalizeFgacCustomDocTypeName(x) === name)) {
			throw new ORPCError('CONFLICT', { message: 'Doc type already exists for this project' });
		}
		current.push(name);
		await this.db
			.update(projects)
			.set({ fgacCustomDocTypes: current, updatedAt: new Date() })
			.where(eq(projects.id, projectId));
		await this.seedFgacDefaultsForDocType(projectId, name);
		return { ok: true as const, mergedDocTypes: listMergedFgacDocTypes(current) };
	}

	async removeFgacCustomDocType(projectId: string, rawName: string) {
		const name = normalizeFgacCustomDocTypeName(rawName);
		if (!name) {
			throw new ORPCError('BAD_REQUEST', { message: 'Invalid doc type name' });
		}
		if ((SYSTEM_FGAC_DOC_TYPES as readonly string[]).includes(name)) {
			throw new ORPCError('BAD_REQUEST', { message: 'Cannot remove system doc types' });
		}
		const row = await this.db.query.projects.findFirst({
			where: (t, { eq: eqFn }) => eqFn(t.id, projectId),
		});
		if (!row) {
			throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
		}
		const prev = row.fgacCustomDocTypes ?? [];
		const current = prev.filter((x) => normalizeFgacCustomDocTypeName(x) !== name);
		if (current.length === prev.length) {
			throw new ORPCError('NOT_FOUND', { message: 'Custom doc type not found on this project' });
		}
		await this.db
			.update(projects)
			.set({ fgacCustomDocTypes: current, updatedAt: new Date() })
			.where(eq(projects.id, projectId));
		return { ok: true as const, mergedDocTypes: listMergedFgacDocTypes(current) };
	}

	private async loadProjectBySlug(slug: string) {
		const project = await this.db.query.projects.findFirst({
			where: (table, { eq }) => eq(table.slug, slug),
		});
		if (!project) {
			throw new ORPCError('NOT_FOUND', {
				message: 'Project not found',
			});
		}
		return project;
	}

	async getProjectAccess(
		slug: string,
		userId: string,
		isSuperAdmin: boolean,
		minRole: ProjectRole = 'viewer',
	): Promise<ProjectAccess> {
		const project = await this.loadProjectBySlug(slug);
		if (!project.isActive) {
			throw new ORPCError('FORBIDDEN', {
				message: 'Project is inactive',
			});
		}

		if (isSuperAdmin) {
			return { project, role: 'owner' };
		}

		const membership = await this.db.query.projectMemberships.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, project.id), eq(table.userId, userId), eq(table.isActive, true)),
		});

		if (!membership) {
			throw new ORPCError('FORBIDDEN', {
				message: 'You do not have access to this project',
			});
		}

		assertRoleAtLeast(membership.role as ProjectRole, minRole);
		return {
			project,
			role: membership.role as ProjectRole,
		};
	}

	private async listProjectResourceRefs(projectId: string) {
		const [clientsRows, scopeSetRows] = await Promise.all([
			this.db.query.oidcClients.findMany({
				where: (table, { and, eq }) =>
					and(eq(table.projectId, projectId), eq(table.isActive, true)),
			}),
			this.db.query.oidcScopeSets.findMany({
				where: (table, { and, eq }) =>
					and(eq(table.projectId, projectId), eq(table.isActive, true)),
			}),
		]);

		return [
			{ type: 'project' as const, id: projectId },
			...clientsRows.map((row) => ({ type: 'client' as const, id: row.id })),
			...scopeSetRows.map((row) => ({ type: 'scope_set' as const, id: row.id })),
		];
	}

	async syncMembershipGrants(projectId: string, userId: string, role: ProjectRole): Promise<void> {
		const permissionService = await this.permissionService(projectId);
		const subject = `user:${userId}` as Subject;
		const resources = await this.listProjectResourceRefs(projectId);

		for (const resource of resources) {
			for (const relation of PROJECT_FGAC_RELATIONS) {
				await permissionService.revoke(subject, relation, resource).catch(() => undefined);
			}
			await permissionService.grant(subject, role, resource);
		}
	}

	private async syncAllActiveMemberships(projectId: string): Promise<void> {
		const memberships = await this.db.query.projectMemberships.findMany({
			where: (table, { and, eq }) => and(eq(table.projectId, projectId), eq(table.isActive, true)),
		});

		for (const membership of memberships) {
			await this.syncMembershipGrants(projectId, membership.userId, membership.role as ProjectRole);
		}
	}

	private async revokeResourceForMembers(
		projectId: string,
		resource: { type: 'client' | 'scope_set' | 'project'; id: string },
	): Promise<void> {
		const memberships = await this.db.query.projectMemberships.findMany({
			where: (table, { and, eq }) => and(eq(table.projectId, projectId), eq(table.isActive, true)),
		});
		const permissionService = await this.permissionService(projectId);

		for (const membership of memberships) {
			const subject = `user:${membership.userId}` as Subject;
			for (const relation of PROJECT_FGAC_RELATIONS) {
				await permissionService.revoke(subject, relation, resource).catch(() => undefined);
			}
		}
	}

	async revokeMembershipGrants(projectId: string, userId: string): Promise<void> {
		const permissionService = await this.permissionService(projectId);
		const subject = `user:${userId}` as Subject;
		const resources = await this.listProjectResourceRefs(projectId);

		for (const resource of resources) {
			for (const relation of PROJECT_FGAC_RELATIONS) {
				await permissionService.revoke(subject, relation, resource).catch(() => undefined);
			}
		}
	}

	async createProject(input: {
		name: string;
		slug?: string;
		description?: string | null;
		createdByUserId: string;
	}) {
		const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
		if (!baseSlug) {
			throw new ORPCError('BAD_REQUEST', { message: 'Invalid project slug' });
		}

		let slug = baseSlug;
		let collision = await this.db.query.projects.findFirst({
			where: (table, { eq }) => eq(table.slug, slug),
		});

		while (collision) {
			slug = `${baseSlug}-${randomToken(3).toLowerCase()}`;
			collision = await this.db.query.projects.findFirst({
				where: (table, { eq }) => eq(table.slug, slug),
			});
		}

		const projectId = crypto.randomUUID();
		const created = await this.db
			.insert(projects)
			.values({
				id: projectId,
				slug,
				name: input.name.trim(),
				description: input.description ?? null,
				createdByUserId: input.createdByUserId,
				isActive: true,
			})
			.returning();

		await this.db.insert(projectMemberships).values({
			id: crypto.randomUUID(),
			projectId,
			userId: input.createdByUserId,
			role: 'owner',
			isActive: true,
			invitedByUserId: input.createdByUserId,
		});

		const defaultScopeSetId = crypto.randomUUID();
		await this.db.insert(oidcScopeSets).values({
			id: defaultScopeSetId,
			projectId,
			name: DEFAULT_SCOPE_SET_NAME,
			description: 'Default OIDC scope set',
			isDefault: true,
			isActive: true,
		});

		await this.db.insert(oidcScopeSetScopes).values(
			DEFAULT_SCOPES.map((scope) => ({
				id: crypto.randomUUID(),
				scopeSetId: defaultScopeSetId,
				scope,
			})),
		);

		await this.syncMembershipGrants(projectId, input.createdByUserId, 'owner');
		return created[0];
	}

	async listProjects(userId: string, isSuperAdmin: boolean) {
		if (isSuperAdmin) {
			return this.db.query.projects.findMany({
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
		}

		const memberships = await this.db.query.projectMemberships.findMany({
			where: (table, { and, eq }) => and(eq(table.userId, userId), eq(table.isActive, true)),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});

		if (memberships.length === 0) {
			return [];
		}

		const results = [];
		for (const membership of memberships) {
			const project = await this.db.query.projects.findFirst({
				where: (table, { eq }) => eq(table.id, membership.projectId),
			});
			if (project && project.isActive) {
				results.push({
					...project,
					role: membership.role,
				});
			}
		}
		return results;
	}

	async updateProject(projectId: string, input: { name?: string; description?: string | null; isActive?: boolean }) {
		const [updated] = await this.db
			.update(projects)
			.set({
				name: input.name,
				description: input.description,
				isActive: input.isActive,
				updatedAt: new Date(),
			})
			.where(eq(projects.id, projectId))
			.returning();

		if (!updated) {
			throw new ORPCError('NOT_FOUND', { message: 'Project not found' });
		}
		return updated;
	}

	async inviteMember(input: {
		projectId: string;
		email: string;
		role: ProjectRole;
		invitedByUserId: string;
	}) {
		const token = randomToken(24);
		const tokenHash = await sha256Hex(token);
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

		const [invite] = await this.db
			.insert(projectInvitations)
			.values({
				id: crypto.randomUUID(),
				projectId: input.projectId,
				email: input.email.trim().toLowerCase(),
				role: input.role,
				tokenHash,
				invitedByUserId: input.invitedByUserId,
				expiresAt,
			})
			.returning();

		const inviteUrl = this.env.ADMIN_INVITE_BASE_URL
			? `${this.env.ADMIN_INVITE_BASE_URL.replace(/\/+$/, '')}?token=${token}`
			: null;

		if (inviteUrl && this.env.RESEND_API_KEY && this.env.ADMIN_INVITE_FROM_EMAIL) {
			const resend = new Resend(this.env.RESEND_API_KEY);
			await resend.emails
				.send({
					from: this.env.ADMIN_INVITE_FROM_EMAIL,
					to: input.email,
					subject: 'Project invitation',
					html: `<p>You were invited to a project role: <strong>${input.role}</strong>.</p><p>Invite link: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
				})
				.catch(() => undefined);
		}

		return {
			...invite,
			inviteToken: token,
			inviteUrl,
		};
	}

	async acceptPendingInvitations(email: string, userId: string): Promise<number> {
		const normalized = email.trim().toLowerCase();
		const pending = await this.db.query.projectInvitations.findMany({
			where: (table, { and, eq, gt, isNull }) =>
				and(
					eq(table.email, normalized),
					gt(table.expiresAt, new Date()),
					isNull(table.acceptedAt),
					isNull(table.revokedAt),
				),
		});

		for (const invite of pending) {
			await this.db
				.insert(projectMemberships)
				.values({
					id: crypto.randomUUID(),
					projectId: invite.projectId,
					userId,
					role: invite.role,
					isActive: true,
					invitedByUserId: invite.invitedByUserId,
				})
				.onConflictDoUpdate({
					target: [projectMemberships.projectId, projectMemberships.userId],
					set: {
						role: invite.role,
						isActive: true,
						updatedAt: new Date(),
					},
				});

			await this.db
				.update(projectInvitations)
				.set({ acceptedAt: new Date(), updatedAt: new Date() })
				.where(eq(projectInvitations.id, invite.id));

			await this.syncMembershipGrants(invite.projectId, userId, invite.role as ProjectRole);
		}

		return pending.length;
	}

	async listInvitations(projectId: string) {
		return this.db.query.projectInvitations.findMany({
			where: (table, { eq }) => eq(table.projectId, projectId),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});
	}

	async revokeInvitation(projectId: string, invitationId: string) {
		const [invite] = await this.db
			.update(projectInvitations)
			.set({ revokedAt: new Date(), updatedAt: new Date() })
			.where(
				and(eq(projectInvitations.projectId, projectId), eq(projectInvitations.id, invitationId)),
			)
			.returning();

		if (!invite) {
			throw new ORPCError('NOT_FOUND', { message: 'Invitation not found' });
		}
		return invite;
	}

	async listMembers(projectId: string) {
		const memberships = await this.db.query.projectMemberships.findMany({
			where: (table, { and, eq }) => and(eq(table.projectId, projectId), eq(table.isActive, true)),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});

		const results = [];
		for (const membership of memberships) {
			const user = await this.db.query.users.findFirst({
				where: (table, { eq }) => eq(table.id, membership.userId),
			});
			results.push({
				...membership,
				user: user
					? {
							id: user.id,
							email: user.email,
							name: user.name,
						}
					: null,
			});
		}
		return results;
	}

	async updateMemberRole(projectId: string, userId: string, role: ProjectRole, invitedByUserId: string) {
		await this.db
			.insert(projectMemberships)
			.values({
				id: crypto.randomUUID(),
				projectId,
				userId,
				role,
				isActive: true,
				invitedByUserId,
			})
			.onConflictDoUpdate({
				target: [projectMemberships.projectId, projectMemberships.userId],
				set: {
					role,
					isActive: true,
					updatedAt: new Date(),
				},
			});

		await this.syncMembershipGrants(projectId, userId, role);

		return this.db.query.projectMemberships.findFirst({
			where: (table, { and, eq }) => and(eq(table.projectId, projectId), eq(table.userId, userId)),
		});
	}

	async removeMember(projectId: string, userId: string) {
		const [membership] = await this.db
			.update(projectMemberships)
			.set({
				isActive: false,
				updatedAt: new Date(),
			})
			.where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.userId, userId)))
			.returning();

		if (!membership) {
			throw new ORPCError('NOT_FOUND', { message: 'Membership not found' });
		}

		await this.revokeMembershipGrants(projectId, userId);
		return membership;
	}

	async createScopeSet(projectId: string, input: { name: string; description?: string | null; scopes: string[]; isDefault?: boolean }, createdByUserId: string) {
		const [scopeSet] = await this.db
			.insert(oidcScopeSets)
			.values({
				id: crypto.randomUUID(),
				projectId,
				name: input.name.trim(),
				description: input.description ?? null,
				isDefault: input.isDefault ?? false,
				isActive: true,
			})
			.returning();

		if (input.isDefault) {
			await this.db
				.update(oidcScopeSets)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(and(eq(oidcScopeSets.projectId, projectId), ne(oidcScopeSets.id, scopeSet.id)))
				.catch(() => undefined);
		}

		await this.db.insert(oidcScopeSetScopes).values(
			Array.from(new Set(input.scopes)).map((scope) => ({
				id: crypto.randomUUID(),
				scopeSetId: scopeSet.id,
				scope,
			})),
		);

		const permissionService = await this.permissionService(projectId);
		await permissionService.grant(`user:${createdByUserId}` as Subject, 'owner', {
			type: 'scope_set',
			id: scopeSet.id,
		});
		await this.syncAllActiveMemberships(projectId);

		return scopeSet;
	}

	async listScopeSets(projectId: string) {
		const scopeSets = await this.db.query.oidcScopeSets.findMany({
			where: (table, { eq }) => eq(table.projectId, projectId),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});

		const result = [];
		for (const scopeSet of scopeSets) {
			const scopes = await this.db.query.oidcScopeSetScopes.findMany({
				where: (table, { eq }) => eq(table.scopeSetId, scopeSet.id),
			});
			result.push({
				...scopeSet,
				scopes: scopes.map((scope) => scope.scope),
			});
		}
		return result;
	}

	async updateScopeSet(projectId: string, scopeSetId: string, input: { name?: string; description?: string | null; isActive?: boolean }) {
		const [updated] = await this.db
			.update(oidcScopeSets)
			.set({
				name: input.name,
				description: input.description,
				isActive: input.isActive,
				updatedAt: new Date(),
			})
			.where(and(eq(oidcScopeSets.id, scopeSetId), eq(oidcScopeSets.projectId, projectId)))
			.returning();

		if (!updated) {
			throw new ORPCError('NOT_FOUND', { message: 'Scope set not found' });
		}
		if (input.isActive === false) {
			await this.revokeResourceForMembers(projectId, {
				type: 'scope_set',
				id: scopeSetId,
			});
		}
		return updated;
	}

	async addScopeToSet(projectId: string, scopeSetId: string, scope: string) {
		const scopeSet = await this.db.query.oidcScopeSets.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, scopeSetId), eq(table.projectId, projectId)),
		});
		if (!scopeSet) {
			throw new ORPCError('NOT_FOUND', { message: 'Scope set not found' });
		}

		await this.db
			.insert(oidcScopeSetScopes)
			.values({
				id: crypto.randomUUID(),
				scopeSetId,
				scope,
			})
			.onConflictDoNothing();
		return { ok: true };
	}

	async removeScopeFromSet(projectId: string, scopeSetId: string, scope: string) {
		const scopeSet = await this.db.query.oidcScopeSets.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, scopeSetId), eq(table.projectId, projectId)),
		});
		if (!scopeSet) {
			throw new ORPCError('NOT_FOUND', { message: 'Scope set not found' });
		}

		await this.db.delete(oidcScopeSetScopes).where(
			and(eq(oidcScopeSetScopes.scopeSetId, scopeSetId), eq(oidcScopeSetScopes.scope, scope)),
		);
		return { ok: true };
	}

	async createClient(projectId: string, input: {
		name: string;
		clientId: string;
		isPublic: boolean;
		redirectUris: string[];
		scopeSetIds?: string[];
	}, createdByUserId: string) {
		const existing = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) =>
				and(eq(table.projectId, projectId), eq(table.clientId, input.clientId)),
		});
		if (existing) {
			throw new ORPCError('CONFLICT', {
				message: 'client_id already exists in this project',
			});
		}

		const clientSecret = input.isPublic ? null : randomToken(36);
		const [client] = await this.db
			.insert(oidcClients)
			.values({
				id: crypto.randomUUID(),
				projectId,
				clientId: input.clientId,
				clientSecret,
				name: input.name.trim(),
				isPublic: input.isPublic,
				isActive: true,
			})
			.returning();

		const normalizedRedirectUris = Array.from(
			new Set(input.redirectUris.map((u) => normalizeRedirectUri(u)).filter((u) => u.length > 0)),
		);
		await this.db.insert(oidcClientRedirectUris).values(
			normalizedRedirectUris.map((redirectUri) => ({
				id: crypto.randomUUID(),
				clientId: client.id,
				redirectUri,
			})),
		);

		let scopeSetIds = input.scopeSetIds ?? [];
		if (scopeSetIds.length === 0) {
			const defaults = await this.db.query.oidcScopeSets.findMany({
				where: (table, { and, eq }) =>
					and(eq(table.projectId, projectId), eq(table.isDefault, true), eq(table.isActive, true)),
			});
			scopeSetIds = defaults.map((item) => item.id);
		}

		if (scopeSetIds.length > 0) {
			await this.db.insert(oidcClientScopeSets).values(
				Array.from(new Set(scopeSetIds)).map((scopeSetId) => ({
					id: crypto.randomUUID(),
					clientId: client.id,
					scopeSetId,
				})),
			);
		}

		const permissionService = await this.permissionService(projectId);
		await permissionService.grant(`user:${createdByUserId}` as Subject, 'owner', {
			type: 'client',
			id: client.id,
		});
		await this.syncAllActiveMemberships(projectId);

		return {
			...client,
			clientSecret,
		};
	}

	async listClients(projectId: string) {
		const clients = await this.db.query.oidcClients.findMany({
			where: (table, { eq }) => eq(table.projectId, projectId),
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});

		const result = [];
		for (const client of clients) {
			const redirectUris = await this.db.query.oidcClientRedirectUris.findMany({
				where: (table, { eq }) => eq(table.clientId, client.id),
			});
			const scopeSets = await this.db.query.oidcClientScopeSets.findMany({
				where: (table, { eq }) => eq(table.clientId, client.id),
			});
			result.push({
				...client,
				redirectUris: redirectUris.map((row) => row.redirectUri),
				scopeSetIds: scopeSets.map((row) => row.scopeSetId),
			});
		}
		return result;
	}

	async updateClient(projectId: string, clientRecordId: string, input: { name?: string; isPublic?: boolean; isActive?: boolean }) {
		const [updated] = await this.db
			.update(oidcClients)
			.set({
				name: input.name,
				isPublic: input.isPublic,
				isActive: input.isActive,
				updatedAt: new Date(),
			})
			.where(and(eq(oidcClients.id, clientRecordId), eq(oidcClients.projectId, projectId)))
			.returning();

		if (!updated) {
			throw new ORPCError('NOT_FOUND', { message: 'Client not found' });
		}
		if (input.isActive === false) {
			await this.revokeResourceForMembers(projectId, {
				type: 'client',
				id: clientRecordId,
			});
		}
		return updated;
	}

	async rotateClientSecret(projectId: string, clientRecordId: string) {
		const client = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, clientRecordId), eq(table.projectId, projectId)),
		});
		if (!client) {
			throw new ORPCError('NOT_FOUND', { message: 'Client not found' });
		}
		if (client.isPublic) {
			throw new ORPCError('BAD_REQUEST', {
				message: 'Public clients do not use client secrets',
			});
		}

		const secret = randomToken(36);
		await this.db
			.update(oidcClients)
			.set({
				clientSecret: secret,
				updatedAt: new Date(),
			})
			.where(eq(oidcClients.id, client.id));

		return {
			clientId: client.id,
			clientSecret: secret,
		};
	}

	async addClientRedirectUri(projectId: string, clientRecordId: string, redirectUri: string) {
		const client = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, clientRecordId), eq(table.projectId, projectId)),
		});
		if (!client) {
			throw new ORPCError('NOT_FOUND', { message: 'Client not found' });
		}

		const normalized = normalizeRedirectUri(redirectUri);
		await this.db
			.insert(oidcClientRedirectUris)
			.values({
				id: crypto.randomUUID(),
				clientId: client.id,
				redirectUri: normalized,
			})
			.onConflictDoNothing();
		return { ok: true };
	}

	async removeClientRedirectUri(projectId: string, clientRecordId: string, redirectUri: string) {
		const client = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, clientRecordId), eq(table.projectId, projectId)),
		});
		if (!client) {
			throw new ORPCError('NOT_FOUND', { message: 'Client not found' });
		}

		const rows = await this.db.query.oidcClientRedirectUris.findMany({
			where: (table, { eq }) => eq(table.clientId, client.id),
		});
		const target = normalizeRedirectUri(redirectUri);
		const ids = rows
			.filter((row) => normalizeRedirectUri(row.redirectUri) === target)
			.map((row) => row.id);
		if (ids.length > 0) {
			await this.db.delete(oidcClientRedirectUris).where(inArray(oidcClientRedirectUris.id, ids));
		}
		return { ok: true };
	}

	async attachScopeSetToClient(projectId: string, clientRecordId: string, scopeSetId: string) {
		const [client, scopeSet] = await Promise.all([
			this.db.query.oidcClients.findFirst({
				where: (table, { and, eq }) =>
					and(eq(table.id, clientRecordId), eq(table.projectId, projectId)),
			}),
			this.db.query.oidcScopeSets.findFirst({
				where: (table, { and, eq }) =>
					and(eq(table.id, scopeSetId), eq(table.projectId, projectId)),
			}),
		]);

		if (!client || !scopeSet) {
			throw new ORPCError('NOT_FOUND', {
				message: 'Client or scope set not found',
			});
		}

		await this.db
			.insert(oidcClientScopeSets)
			.values({
				id: crypto.randomUUID(),
				clientId: client.id,
				scopeSetId: scopeSet.id,
			})
			.onConflictDoNothing();

		return { ok: true };
	}

	async detachScopeSetFromClient(projectId: string, clientRecordId: string, scopeSetId: string) {
		const client = await this.db.query.oidcClients.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, clientRecordId), eq(table.projectId, projectId)),
		});
		if (!client) {
			throw new ORPCError('NOT_FOUND', { message: 'Client not found' });
		}

		await this.db.delete(oidcClientScopeSets).where(
			and(eq(oidcClientScopeSets.clientId, client.id), eq(oidcClientScopeSets.scopeSetId, scopeSetId)),
		);
		return { ok: true };
	}

	async assertProjectSlugMatchesId(slug: string, projectId: string) {
		const p = await this.loadProjectBySlug(slug);
		if (p.id !== projectId) {
			throw new ORPCError('FORBIDDEN', {
				message: 'API key not authorized for this project',
			});
		}
		if (!p.isActive) {
			throw new ORPCError('FORBIDDEN', {
				message: 'Project is inactive',
			});
		}
		return p;
	}

	async validateProjectApiKey(
		fullKey: string,
	): Promise<{ projectId: string; scopes: string[] } | null> {
		const trimmed = fullKey.trim();
		if (!trimmed.startsWith(PROJECT_API_KEY_PREFIX)) {
			return null;
		}
		const hash = await sha256Hex(trimmed);
		const row = await this.db.query.projectApiKeys.findFirst({
			where: (table, { and, eq, isNull }) =>
				and(eq(table.keyHash, hash), isNull(table.revokedAt)),
		});
		if (!row) {
			return null;
		}
		await this.db
			.update(projectApiKeys)
			.set({ lastUsedAt: new Date(), updatedAt: new Date() })
			.where(eq(projectApiKeys.id, row.id));
		return { projectId: row.projectId, scopes: row.scopes ?? [] };
	}

	async createProjectApiKey(
		projectId: string,
		createdByUserId: string,
		input: { name: string; scopes: string[] },
	): Promise<{ id: string; keyPrefix: string; apiKey: string; scopes: string[] }> {
		const secretSuffix = randomToken(32);
		const fullKey = `${PROJECT_API_KEY_PREFIX}${secretSuffix}`;
		const keyHash = await sha256Hex(fullKey);
		const keyPrefix = fullKey.slice(0, 20);
		const id = crypto.randomUUID();
		await this.db.insert(projectApiKeys).values({
			id,
			projectId,
			name: input.name.trim(),
			keyPrefix,
			keyHash,
			scopes: input.scopes,
			createdByUserId,
		});
		return { id, keyPrefix, apiKey: fullKey, scopes: input.scopes };
	}

	async listProjectApiKeys(projectId: string) {
		return this.db.query.projectApiKeys.findMany({
			where: (table, { eq }) => eq(table.projectId, projectId),
			columns: {
				id: true,
				name: true,
				keyPrefix: true,
				scopes: true,
				revokedAt: true,
				lastUsedAt: true,
				createdAt: true,
			},
			orderBy: (table, { desc }) => [desc(table.createdAt)],
		});
	}

	async revokeProjectApiKey(projectId: string, keyId: string): Promise<{ ok: true }> {
		const row = await this.db.query.projectApiKeys.findFirst({
			where: (table, { and, eq }) => and(eq(table.id, keyId), eq(table.projectId, projectId)),
		});
		if (!row) {
			throw new ORPCError('NOT_FOUND', { message: 'API key not found' });
		}
		if (row.revokedAt) {
			return { ok: true as const };
		}
		await this.db
			.update(projectApiKeys)
			.set({ revokedAt: new Date(), updatedAt: new Date() })
			.where(eq(projectApiKeys.id, keyId));
		return { ok: true as const };
	}
}
