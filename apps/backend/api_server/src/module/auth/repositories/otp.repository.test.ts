import { describe, expect, it, vi } from 'vitest';
import { consumeOtpRateLimit } from './otp.repository';

function makeRateLimitDb() {
	let row: Record<string, unknown> | null = null;

	return {
		db: {
			query: {
				otpRateLimits: {
					findFirst: vi.fn(async () => row),
				},
			},
			insert: vi.fn(() => ({
				values: (value: Record<string, unknown>) => ({
					onConflictDoUpdate: vi.fn(async ({ set }: { set: Record<string, unknown> }) => {
						row = row ? { ...row, ...set } : { ...value };
					}),
				}),
			})),
			update: vi.fn(() => ({
				set: (value: Record<string, unknown>) => ({
					where: vi.fn(async () => {
						row = row ? { ...row, ...value } : { ...value };
					}),
				}),
			})),
		},
		getRow: () => row,
	};
}

describe('consumeOtpRateLimit', () => {
	it('increments within the active window and blocks after the limit', async () => {
		const { db, getRow } = makeRateLimitDb();
		const now = new Date('2026-05-05T00:00:00Z');

		await expect(consumeOtpRateLimit(db as never, {
			scope: 'otp:user:verify:email',
			keyHash: 'email-hash',
			limit: 1,
			windowMs: 15 * 60 * 1000,
			blockMs: 15 * 60 * 1000,
			now,
		})).resolves.toMatchObject({ allowed: true, count: 1 });

		await expect(consumeOtpRateLimit(db as never, {
			scope: 'otp:user:verify:email',
			keyHash: 'email-hash',
			limit: 1,
			windowMs: 15 * 60 * 1000,
			blockMs: 15 * 60 * 1000,
			now: new Date(now.getTime() + 1000),
		})).resolves.toMatchObject({ allowed: false, count: 2 });

		expect(getRow()?.blockedUntil).toBeInstanceOf(Date);
	});

	it('rejects while blocked and resets once the block expires', async () => {
		const { db } = makeRateLimitDb();
		const now = new Date('2026-05-05T00:00:00Z');
		const base = {
			scope: 'otp:user:request:ip',
			keyHash: 'ip-hash',
			limit: 1,
			windowMs: 60 * 60 * 1000,
			blockMs: 15 * 60 * 1000,
		};

		await consumeOtpRateLimit(db as never, { ...base, now });
		await consumeOtpRateLimit(db as never, { ...base, now: new Date(now.getTime() + 1000) });

		await expect(consumeOtpRateLimit(db as never, {
			...base,
			now: new Date(now.getTime() + 2000),
		})).resolves.toMatchObject({ allowed: false });

		await expect(consumeOtpRateLimit(db as never, {
			...base,
			now: new Date(now.getTime() + 16 * 60 * 1000),
		})).resolves.toMatchObject({ allowed: true, count: 1 });
	});

	it('resets the count after the window expires', async () => {
		const { db } = makeRateLimitDb();
		const now = new Date('2026-05-05T00:00:00Z');
		const base = {
			scope: 'otp:admin:request:device',
			keyHash: 'device-hash',
			limit: 5,
			windowMs: 60 * 60 * 1000,
			blockMs: 60 * 60 * 1000,
		};

		await consumeOtpRateLimit(db as never, { ...base, now });

		await expect(consumeOtpRateLimit(db as never, {
			...base,
			now: new Date(now.getTime() + 61 * 60 * 1000),
		})).resolves.toMatchObject({ allowed: true, count: 1 });
	});
});
