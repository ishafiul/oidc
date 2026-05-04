import { ORPCError } from '@orpc/server';
import z from 'zod';
import { publicProcedure } from '../../procedure';
import { getTRPCContext } from '../../core/context';
import {
	assertSystemAdminAccess,
	requireSessionUser,
} from '../projects/route';
import { AdminUsersService } from './service';

const OPENAPI_TAG = 'Admin';

const adminUserIdParamsDto = z.object({
	userId: z.string().min(1),
});

const adminUserSessionParamsDto = adminUserIdParamsDto.extend({
	sessionId: z.string().min(1),
});

const listUsersQueryDto = z.object({
	projectSlug: z.string().min(1).optional(),
});

const adminProjectQueryDto = z.object({
	projectSlug: z.string().min(1).optional(),
});

const updateAdminUserBodyDto = z.object({
	name: z.string().max(200).nullable().optional(),
	isBanned: z.boolean().optional(),
	banReason: z.string().max(2000).nullable().optional(),
	bannedUntil: z.string().nullable().optional(),
});

export const adminRoutes = {
	listUsers: publicProcedure
		.route({
			method: 'GET',
			path: '/admin/users',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(
			z.object({
				query: listUsersQueryDto.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const authed = await requireSessionUser(context);
			const selectedProjectSlug = input.query?.projectSlug?.trim();
			const projectIds =
				selectedProjectSlug && selectedProjectSlug.length > 0
					? [
							(
								await authed.projectsService.getProjectAccess(
									selectedProjectSlug,
									authed.user.id,
									authed.isSuperAdmin,
									'viewer',
								)
							).project.id,
						]
					: (await authed.projectsService.listProjects(authed.user.id, authed.isSuperAdmin)).map(
							(project) => project.id,
						);
			const service = new AdminUsersService(authed.ctx.get('db'));
			return service.listUsers({ projectIds });
		}),

	updateUser: publicProcedure
		.route({
			method: 'PATCH',
			path: '/admin/users/:userId',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(
			z.object({
				params: adminUserIdParamsDto,
				body: updateAdminUserBodyDto,
			}),
		)
		.handler(async ({ input, context }) => {
			const authed = await requireSessionUser(context);
			assertSystemAdminAccess(authed.ctx, authed.user.id);
			const hasMutation =
				input.body.name !== undefined ||
				input.body.isBanned !== undefined;
			if (!hasMutation) {
				throw new ORPCError('BAD_REQUEST', { message: 'No changes provided' });
			}
			const service = new AdminUsersService(authed.ctx.get('db'));
			return service.updateUser(authed.user.id, input.params.userId, input.body);
		}),

	revokeUserSession: publicProcedure
		.route({
			method: 'DELETE',
			path: '/admin/users/:userId/sessions/:sessionId',
			tags: [OPENAPI_TAG],
			inputStructure: 'detailed',
		})
		.input(
			z.object({
				params: adminUserSessionParamsDto,
				query: adminProjectQueryDto.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const authed = await requireSessionUser(context);
			const selectedProjectSlug = input.query?.projectSlug?.trim();
			const manageableProjectIds =
				selectedProjectSlug && selectedProjectSlug.length > 0
					? [
							(
								await authed.projectsService.getProjectAccess(
									selectedProjectSlug,
									authed.user.id,
									authed.isSuperAdmin,
									'admin',
								)
							).project.id,
						]
					: (
							await authed.projectsService.listProjects(authed.user.id, authed.isSuperAdmin)
						)
							.filter(
								(project) =>
									authed.isSuperAdmin ||
									(('role' in project && (project.role === 'admin' || project.role === 'owner'))),
							)
							.map((project) => project.id);
			const service = new AdminUsersService(authed.ctx.get('db'));
			return service.revokeUserSession({
				operatorUserId: authed.user.id,
				targetUserId: input.params.userId,
				sessionId: input.params.sessionId,
				manageableProjectIds,
				isSuperAdmin: authed.isSuperAdmin,
			});
		}),
};
