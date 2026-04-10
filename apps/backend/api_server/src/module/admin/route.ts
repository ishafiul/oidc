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
		})
		.handler(async ({ context }) => {
			const authed = await requireSessionUser(context);
			assertSystemAdminAccess(authed.ctx, authed.user.id);
			const service = new AdminUsersService(authed.ctx.get('db'));
			return service.listUsers();
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
};
