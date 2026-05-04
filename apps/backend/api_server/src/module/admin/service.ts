import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import type { DB } from '../../core/db';
import { auths, devices, users } from '../../core/db/schema';
import { banUser, findUserById, unbanUser } from '../auth/repositories/user.repository';

const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminDeviceInfo = {
	readonly id: string;
	readonly fingerprint: string | null;
	readonly deviceType: string | null;
	readonly osName: string | null;
	readonly osVersion: string | null;
	readonly deviceModel: string | null;
	readonly isPhysicalDevice: string | null;
	readonly appVersion: string | null;
	readonly ipAddress: string | null;
	readonly city: string | null;
	readonly countryCode: string | null;
	readonly isp: string | null;
	readonly colo: string | null;
	readonly longitude: string | null;
	readonly latitude: string | null;
	readonly timezone: string | null;
	readonly hasFcmToken: boolean;
	readonly fcmToken: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type AdminUserSessionInfo = {
	readonly id: string;
	readonly userId: string;
	readonly deviceId: string;
	readonly lastRefresh: Date | null;
	readonly isTrusted: boolean;
	readonly trustedAt: Date | null;
	readonly activeUntil: Date | null;
	readonly isActive: boolean;
	readonly device: AdminDeviceInfo | null;
};

export type AdminUserListItem = {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
	readonly phoneNumber: string | null;
	readonly avatarUrl: string | null;
	readonly isBanned: boolean;
	readonly bannedAt: Date | null;
	readonly bannedUntil: Date | null;
	readonly banReason: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly sessions: AdminUserSessionInfo[];
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
		const sessionRows = await this.db
			.select({
				id: auths.id,
				userId: auths.userId,
				deviceId: auths.deviceId,
				lastRefresh: auths.lastRefresh,
				isTrusted: auths.isTrusted,
				trustedAt: auths.trustedAt,
				deviceRowId: devices.id,
				fingerprint: devices.fingerprint,
				deviceType: devices.deviceType,
				osName: devices.osName,
				osVersion: devices.osVersion,
				deviceModel: devices.deviceModel,
				isPhysicalDevice: devices.isPhysicalDevice,
				appVersion: devices.appVersion,
				ipAddress: devices.ipAddress,
				city: devices.city,
				countryCode: devices.countryCode,
				isp: devices.isp,
				colo: devices.colo,
				longitude: devices.longitude,
				latitude: devices.latitude,
				timezone: devices.timezone,
				fcmToken: devices.fcmToken,
				deviceCreatedAt: devices.createdAt,
				deviceUpdatedAt: devices.updatedAt,
			})
			.from(auths)
			.leftJoin(devices, eq(auths.deviceId, devices.id));

		const sessionsByUserId = new Map<string, AdminUserSessionInfo[]>();
		const now = Date.now();
		for (const row of sessionRows) {
			const activeUntil = row.lastRefresh
				? new Date(row.lastRefresh.getTime() + AUTH_SESSION_TTL_MS)
				: null;
			const device =
				row.deviceRowId && row.deviceCreatedAt && row.deviceUpdatedAt
					? {
							id: row.deviceRowId,
							fingerprint: row.fingerprint,
							deviceType: row.deviceType,
							osName: row.osName,
							osVersion: row.osVersion,
							deviceModel: row.deviceModel,
							isPhysicalDevice: row.isPhysicalDevice,
							appVersion: row.appVersion,
							ipAddress: row.ipAddress,
							city: row.city,
							countryCode: row.countryCode,
							isp: row.isp,
							colo: row.colo,
							longitude: row.longitude,
							latitude: row.latitude,
							timezone: row.timezone,
							hasFcmToken: Boolean(row.fcmToken),
							fcmToken: row.fcmToken,
							createdAt: row.deviceCreatedAt,
							updatedAt: row.deviceUpdatedAt,
						}
					: null;
			const session: AdminUserSessionInfo = {
				id: row.id,
				userId: row.userId,
				deviceId: row.deviceId,
				lastRefresh: row.lastRefresh,
				isTrusted: row.isTrusted,
				trustedAt: row.trustedAt,
				activeUntil,
				isActive: activeUntil !== null && activeUntil.getTime() > now,
				device,
			};
			const existing = sessionsByUserId.get(row.userId) ?? [];
			existing.push(session);
			sessionsByUserId.set(row.userId, existing);
		}

		return rows.map((row) => ({
			id: row.id,
			email: row.email,
			name: row.name,
			phoneNumber: row.phoneNumber,
			avatarUrl: row.avatarUrl,
			isBanned: row.isBanned,
			bannedAt: row.bannedAt,
			bannedUntil: row.bannedUntil,
			banReason: row.banReason,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			sessions: (sessionsByUserId.get(row.id) ?? []).sort((a, b) => {
				if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
				return (b.lastRefresh?.getTime() ?? 0) - (a.lastRefresh?.getTime() ?? 0);
			}),
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
			avatarUrl: updated.avatarUrl,
			isBanned: updated.isBanned,
			bannedAt: updated.bannedAt,
			bannedUntil: updated.bannedUntil,
			banReason: updated.banReason,
			createdAt: updated.createdAt,
			updatedAt: updated.updatedAt,
			sessions: [],
		};
	}
}
