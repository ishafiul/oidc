import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import type { DB } from '../../core/db';
import { users } from '../../core/db/schema';
import { banUser, findUserById, unbanUser } from '../auth/repositories/user.repository';

export type AdminUserListItem = {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
	readonly phoneNumber: string | null;
	readonly isBanned: boolean;
	readonly bannedAt: Date | null;
	readonly bannedUntil: Date | null;
	readonly banReason: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type UpdateAdminUserInput = {
	readonly name?: string | null;
	readonly isBanned?: boolean;
	readonly banReason?: string | null;
	readonly bannedUntil?: string | null;
};

export class AdminUsersService {
	constructor(private readonly db: DB) {}

	async listUsers(): Promise<AdminUserListItem[]> {
		const rows = await this.db.query.users.findMany({
			orderBy: (table, { desc: d }) => [d(table.createdAt)],
		});
		return rows.map((row) => ({
			id: row.id,
			email: row.email,
			name: row.name,
			phoneNumber: row.phoneNumber,
			isBanned: row.isBanned,
			bannedAt: row.bannedAt,
			bannedUntil: row.bannedUntil,
			banReason: row.banReason,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}));
	}

	async updateUser(
		operatorUserId: string,
		targetUserId: string,
		body: UpdateAdminUserInput,
	): Promise<AdminUserListItem> {
		const existing = await findUserById(this.db, targetUserId);
		if (!existing) {
			throw new ORPCError('NOT_FOUND', { message: 'User not found' });
		}

		if (body.isBanned === true && targetUserId === operatorUserId) {
			throw new ORPCError('BAD_REQUEST', { message: 'Cannot ban your own account' });
		}

		if (body.name !== undefined) {
			await this.db
				.update(users)
				.set({ name: body.name, updatedAt: new Date() })
				.where(eq(users.id, targetUserId));
		}

		if (body.isBanned === true) {
			let until: Date | null = null;
			if (body.bannedUntil && body.bannedUntil.trim().length > 0) {
				const parsed = new Date(body.bannedUntil);
				if (Number.isNaN(parsed.getTime())) {
					throw new ORPCError('BAD_REQUEST', { message: 'Invalid bannedUntil date' });
				}
				until = parsed;
			}
			await banUser(this.db, targetUserId, body.banReason ?? null, until);
		} else if (body.isBanned === false) {
			await unbanUser(this.db, targetUserId);
		}

		const updated = await findUserById(this.db, targetUserId);
		if (!updated) {
			throw new ORPCError('NOT_FOUND', { message: 'User not found' });
		}

		return {
			id: updated.id,
			email: updated.email,
			name: updated.name,
			phoneNumber: updated.phoneNumber,
			isBanned: updated.isBanned,
			bannedAt: updated.bannedAt,
			bannedUntil: updated.bannedUntil,
			banReason: updated.banReason,
			createdAt: updated.createdAt,
			updatedAt: updated.updatedAt,
		};
	}
}
