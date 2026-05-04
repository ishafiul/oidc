import { and, eq, sql } from 'drizzle-orm';
import { DB } from "../../../core/db";
import { otpAttemptEvents, otpRateLimits, otps } from "../../../core/db/schema";

export type OtpPurpose = 'user' | 'admin';
export type OtpAttemptOutcome =
	| 'requested'
	| 'request_rate_limited'
	| 'verify_rate_limited'
	| 'not_found'
	| 'expired'
	| 'locked'
	| 'invalid'
	| 'locked_after_invalid'
	| 'verified';

export async function findOtpByDeviceAndEmail(db: DB, deviceId: string, email: string) {
	return db.query.otps.findFirst({
		where: (otps, { eq, and }) => and(eq(otps.deviceUuId, deviceId), eq(otps.email, email)),
	});
}

export async function createOtp(
	db: DB,
	input: {
		id: string;
		otpHash: string;
		email: string;
		deviceUuId: string;
		expiredAt: Date;
		lastRequestAt: Date;
	},
) {
	await db.insert(otps).values({
		id: input.id,
		otpHash: input.otpHash,
		email: input.email,
		deviceUuId: input.deviceUuId,
		expiredAt: input.expiredAt,
		failedAttempts: 0,
		lockedUntil: null,
		lastAttemptAt: null,
		lastRequestAt: input.lastRequestAt,
	});
}

export async function updateOtpChallenge(
	db: DB,
	id: string,
	input: {
		otpHash: string;
		expiredAt: Date;
		lastRequestAt: Date;
	},
) {
	await db.update(otps)
		.set({
			otpHash: input.otpHash,
			expiredAt: input.expiredAt,
			failedAttempts: 0,
			lockedUntil: null,
			lastAttemptAt: null,
			lastRequestAt: input.lastRequestAt,
			updatedAt: input.lastRequestAt,
		})
		.where(eq(otps.id, id));
}

export async function recordOtpFailedAttempt(
	db: DB,
	id: string,
	input: {
		now: Date;
		lockedUntil: Date | null;
	},
) {
	const updateData: {
		failedAttempts: ReturnType<typeof sql>;
		lockedUntil?: Date;
		lastAttemptAt: Date;
		updatedAt: Date;
	} = {
		failedAttempts: sql`${otps.failedAttempts} + 1`,
		lastAttemptAt: input.now,
		updatedAt: input.now,
	};
	if (input.lockedUntil) {
		updateData.lockedUntil = input.lockedUntil;
	}
	const [updated] = await db.update(otps)
		.set(updateData)
		.where(eq(otps.id, id))
		.returning({
			failedAttempts: otps.failedAttempts,
			lockedUntil: otps.lockedUntil,
		});
	return updated;
}

export async function deleteOtpByDeviceAndEmail(db: DB, deviceId: string, email: string) {
	await db.delete(otps).where(
		and(eq(otps.deviceUuId, deviceId), eq(otps.email, email))
	);
}

export async function consumeOtpRateLimit(
	db: DB,
	input: {
		scope: string;
		keyHash: string;
		limit: number;
		windowMs: number;
		blockMs: number;
		now: Date;
	},
): Promise<{ allowed: boolean; blockedUntil?: Date; count: number }> {
	const existing = await db.query.otpRateLimits.findFirst({
		where: (table, { and, eq }) => and(eq(table.scope, input.scope), eq(table.keyHash, input.keyHash)),
	});

	const windowExpired =
		!existing || existing.windowStartedAt.getTime() + input.windowMs <= input.now.getTime();
	const blockExpired =
		existing?.blockedUntil && existing.blockedUntil.getTime() <= input.now.getTime();

	if (existing?.blockedUntil && existing.blockedUntil.getTime() > input.now.getTime()) {
		return { allowed: false, blockedUntil: existing.blockedUntil, count: existing.count };
	}

	if (!existing || windowExpired || blockExpired) {
		await db.insert(otpRateLimits)
			.values({
				id: existing?.id ?? crypto.randomUUID(),
				scope: input.scope,
				keyHash: input.keyHash,
				windowStartedAt: input.now,
				count: 1,
				blockedUntil: null,
				updatedAt: input.now,
			})
			.onConflictDoUpdate({
				target: [otpRateLimits.scope, otpRateLimits.keyHash],
				set: {
					windowStartedAt: input.now,
					count: 1,
					blockedUntil: null,
					updatedAt: input.now,
				},
			});
		return { allowed: true, count: 1 };
	}

	if (existing.count >= input.limit) {
		const blockedUntil = new Date(input.now.getTime() + input.blockMs);
		await db.update(otpRateLimits)
			.set({
				count: existing.count + 1,
				blockedUntil,
				updatedAt: input.now,
			})
			.where(eq(otpRateLimits.id, existing.id));
		return { allowed: false, blockedUntil, count: existing.count + 1 };
	}

	await db.update(otpRateLimits)
		.set({
			count: existing.count + 1,
			updatedAt: input.now,
		})
		.where(eq(otpRateLimits.id, existing.id));
	return { allowed: true, count: existing.count + 1 };
}

export async function createOtpAttemptEvent(
	db: DB,
	input: {
		id: string;
		purpose: OtpPurpose;
		outcome: OtpAttemptOutcome;
		emailHash: string;
		deviceHash: string;
		ipHash: string;
		createdAt: Date;
	},
) {
	await db.insert(otpAttemptEvents).values(input);
}
