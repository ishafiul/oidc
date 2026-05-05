import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
	findActiveAuthSession: vi.fn(),
	isUserBanned: vi.fn(),
}));

vi.mock('../../module/auth/repositories', () => repo);

const { validateUser } = await import('./auth');

const user = {
	id: 'user-1',
	email: 'user@example.com',
	name: null,
	isBanned: false,
	bannedAt: null,
	bannedUntil: null,
	banReason: null,
	phoneNumber: null,
	avatarUrl: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const payload = {
	userId: user.id,
	email: user.email,
	sessionId: 'auth-1',
	deviceId: 'device-1',
	jti: 'auth-1',
	type: 'access' as const,
	iat: 1,
	exp: 2,
};

function makeCtx() {
	const db = {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn().mockResolvedValue([user]),
				})),
			})),
		})),
	};
	return {
		c: {
			get: vi.fn((key: string) => key === 'db' ? db : undefined),
		},
	};
}

describe('core auth validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		repo.isUserBanned.mockResolvedValue(false);
		repo.findActiveAuthSession.mockResolvedValue({
			id: 'auth-1',
			userId: user.id,
			deviceId: 'device-1',
			lastRefresh: new Date(),
		});
	});

	it('requires the exact active session from the access token', async () => {
		const ctx = makeCtx();

		await expect(validateUser(ctx as never, payload)).resolves.toMatchObject({ id: user.id });

		expect(repo.findActiveAuthSession).toHaveBeenCalledWith(expect.anything(), {
			userId: user.id,
			sessionId: 'auth-1',
			deviceId: 'device-1',
		});
	});

	it('rejects a token after its exact session row is gone', async () => {
		repo.findActiveAuthSession.mockResolvedValueOnce(null);
		const ctx = makeCtx();

		await expect(validateUser(ctx as never, payload)).rejects.toThrow('Session not found or expired');
	});

	it('rejects an exact session that has exceeded the max refresh window', async () => {
		repo.findActiveAuthSession.mockResolvedValueOnce({
			id: 'auth-1',
			userId: user.id,
			deviceId: 'device-1',
			lastRefresh: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
		});
		const ctx = makeCtx();

		await expect(validateUser(ctx as never, payload)).rejects.toThrow('Session not found or expired');
	});
});
