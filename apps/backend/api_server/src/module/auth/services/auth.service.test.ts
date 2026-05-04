import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpService } from './otp.service';

const repo = vi.hoisted(() => ({
	findUserByEmail: vi.fn(),
	createUser: vi.fn(),
	isUserBanned: vi.fn(),
	findDeviceById: vi.fn(),
	findOtpByDeviceAndEmail: vi.fn(),
	findAuthByUserId: vi.fn(),
	findDeviceByFingerprint: vi.fn(),
	updateDevice: vi.fn(),
	createDevice: vi.fn(),
	deleteAuthByDeviceId: vi.fn(),
	deleteAuthByUserId: vi.fn(),
	findAuthsByUserId: vi.fn(),
	createAuthSession: vi.fn(),
	findTrustedAuthByDeviceAndUser: vi.fn(),
	findUserById: vi.fn(),
	checkUserBanStatus: vi.fn(),
	deleteOtpByDeviceAndEmail: vi.fn(),
	updateOtpChallenge: vi.fn(),
	createOtp: vi.fn(),
	consumeOtpRateLimit: vi.fn(),
	createOtpAttemptEvent: vi.fn(),
	recordOtpFailedAttempt: vi.fn(),
	updateAuthLastRefresh: vi.fn(),
	findAuthByDeviceId: vi.fn(),
}));

const email = vi.hoisted(() => ({
	sendOtp: vi.fn(),
}));

vi.mock('../repositories', () => repo);
vi.mock('./email.service', () => ({
	EmailService: vi.fn().mockImplementation(() => email),
}));
vi.mock('./jwt.service', () => ({
	JwtService: vi.fn().mockImplementation(() => ({
		generateAccessToken: vi.fn().mockResolvedValue('access-token'),
		verifyToken: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'user@example.com' }),
	})),
}));

const { AuthService } = await import('./auth.service');

const env: Record<string, unknown> = {
	ENVIRONMENT: 'production',
	JWT_SECRET: 'test-secret',
	TEST_EMAIL: 'test@example.com',
	TEST_OTP: '123456',
	RESEND_API_KEY: 'resend-key',
	TURNSTILE_SECRET_KEY: 'turnstile-secret',
	PERMISSION_MANAGER: {},
};

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

async function otpRow(code: string, failedAttempts = 0, lockedUntil: Date | null = null) {
	const otpService = new OtpService();
	return {
		id: 'otp-1',
		email: user.email,
		deviceUuId: '00000000-0000-4000-8000-000000000001',
		otpHash: await otpService.hashOtp(code, 'test-secret'),
		expiredAt: new Date(Date.now() + 60_000),
		failedAttempts,
		lockedUntil,
		lastAttemptAt: null,
		lastRequestAt: new Date(Date.now() - 120_000),
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

function makeService(overrides: Record<string, unknown> = {}) {
	return new AuthService({} as never, { ...env, ...overrides } as never);
}

function mockTurnstileSuccess(action: 'user-otp-request' | 'admin-otp-request' = 'user-otp-request') {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: vi.fn().mockResolvedValue({
			success: true,
			action,
			'error-codes': [],
		}),
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('AuthService OTP hardening', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTurnstileSuccess();
		repo.findUserByEmail.mockResolvedValue(user);
		repo.findDeviceById.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' });
		repo.checkUserBanStatus.mockResolvedValue(false);
		repo.findTrustedAuthByDeviceAndUser.mockResolvedValue(null);
		repo.findAuthsByUserId.mockResolvedValue([]);
		repo.consumeOtpRateLimit.mockResolvedValue({ allowed: true, count: 1 });
		repo.createOtpAttemptEvent.mockResolvedValue(undefined);
		repo.recordOtpFailedAttempt.mockResolvedValue({ failedAttempts: 1, lockedUntil: null });
		repo.deleteOtpByDeviceAndEmail.mockResolvedValue(undefined);
		repo.createAuthSession.mockResolvedValue({ id: 'auth-1' });
		email.sendOtp.mockResolvedValue(undefined);
	});

	it('increments failed attempts for a wrong user OTP', async () => {
		repo.findOtpByDeviceAndEmail.mockResolvedValue(await otpRow('123456'));
		const service = makeService();

		await expect(service.verifyOtp({
			email: user.email,
			otp: 111111,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('Invalid OTP');

		expect(repo.recordOtpFailedAttempt).toHaveBeenCalledWith(
			expect.anything(),
			'otp-1',
			expect.objectContaining({ lockedUntil: null }),
		);
		expect(repo.deleteOtpByDeviceAndEmail).not.toHaveBeenCalled();
		expect(repo.createAuthSession).not.toHaveBeenCalled();
	});

	it('locks an OTP on the 5th failed verification attempt', async () => {
		repo.findOtpByDeviceAndEmail.mockResolvedValue(await otpRow('123456', 4));
		const service = makeService();

		await expect(service.verifyOtp({
			email: user.email,
			otp: 111111,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('OTP is locked');

		expect(repo.recordOtpFailedAttempt).toHaveBeenCalledWith(
			expect.anything(),
			'otp-1',
			expect.objectContaining({ lockedUntil: expect.any(Date) }),
		);
	});

	it('rejects a correct OTP while the row is locked', async () => {
		repo.findOtpByDeviceAndEmail.mockResolvedValue(await otpRow(
			'123456',
			5,
			new Date(Date.now() + 60_000),
		));
		const service = makeService();

		await expect(service.verifyOtp({
			email: user.email,
			otp: 123456,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('OTP is locked');

		expect(repo.deleteOtpByDeviceAndEmail).not.toHaveBeenCalled();
		expect(repo.createAuthSession).not.toHaveBeenCalled();
	});

	it('clears the OTP and creates a session after successful verification', async () => {
		repo.findOtpByDeviceAndEmail.mockResolvedValue(await otpRow('123456'));
		const service = makeService();

		await expect(service.verifyOtp({
			email: user.email,
			otp: 123456,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' })).resolves.toMatchObject({
			success: true,
			accessToken: 'access-token',
		});

		expect(repo.deleteOtpByDeviceAndEmail).toHaveBeenCalledWith(
			expect.anything(),
			'00000000-0000-4000-8000-000000000001',
			user.email,
		);
		expect(repo.createAuthSession).toHaveBeenCalled();
	});

	it('rejects verification before OTP lookup when rate limited', async () => {
		repo.consumeOtpRateLimit.mockResolvedValueOnce({
			allowed: false,
			count: 11,
			blockedUntil: new Date(Date.now() + 60_000),
		});
		const service = makeService();

		await expect(service.verifyOtp({
			email: user.email,
			otp: 123456,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('Too many OTP attempts');

		expect(repo.findOtpByDeviceAndEmail).not.toHaveBeenCalled();
	});

	it('uses fixed TEST_OTP only in development-like environments', async () => {
		const service = makeService({
			ENVIRONMENT: 'development',
			TURNSTILE_SECRET_KEY: undefined,
			TEST_EMAIL: user.email,
			TEST_OTP: '123456',
		});

		repo.findOtpByDeviceAndEmail.mockResolvedValue(null);
		await service.requestOtp({
			email: user.email,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
		}, { ipAddress: '203.0.113.10' });

		const createInput = repo.createOtp.mock.calls[0][1];
		const otpService = new OtpService();
		await expect(otpService.verifyOtp('123456', createInput.otpHash, 'test-secret')).resolves.toBe(true);
		expect(email.sendOtp).not.toHaveBeenCalled();
	});

	it('does not use fixed TEST_OTP when ENVIRONMENT is production', async () => {
		const service = makeService({
			ENVIRONMENT: 'production',
			TEST_EMAIL: user.email,
			TEST_OTP: '123456',
		});

		repo.findOtpByDeviceAndEmail.mockResolvedValue(null);
		await service.requestOtp({
			email: user.email,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
			turnstileToken: 'turnstile-token',
		}, { ipAddress: '203.0.113.10' });

		expect(email.sendOtp).toHaveBeenCalled();
	});

	it('validates Turnstile before user OTP request side effects', async () => {
		const fetchMock = mockTurnstileSuccess('user-otp-request');
		repo.findOtpByDeviceAndEmail.mockResolvedValue(null);
		const service = makeService();

		await service.requestOtp({
			email: user.email,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
			turnstileToken: 'turnstile-token',
		}, { ipAddress: '203.0.113.10' });

		expect(fetchMock).toHaveBeenCalledWith(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			}),
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toMatchObject({
			secret: 'turnstile-secret',
			response: 'turnstile-token',
			remoteip: '203.0.113.10',
		});
		expect(typeof body.idempotency_key).toBe('string');
		expect(repo.createOtp).toHaveBeenCalled();
	});

	it('blocks user OTP request when Turnstile token is invalid', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				success: false,
				action: 'user-otp-request',
				'error-codes': ['invalid-input-response'],
			}),
		}));
		const service = makeService();

		await expect(service.requestOtp({
			email: user.email,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
			turnstileToken: 'bad-token',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('Security check failed. Please retry.');

		expect(repo.findDeviceById).not.toHaveBeenCalled();
		expect(repo.findUserByEmail).not.toHaveBeenCalled();
		expect(email.sendOtp).not.toHaveBeenCalled();
	});

	it('fails closed in production when Turnstile secret is missing', async () => {
		const service = makeService({ TURNSTILE_SECRET_KEY: undefined });

		await expect(service.requestOtp({
			email: user.email,
			deviceUuId: '00000000-0000-4000-8000-000000000001',
			turnstileToken: 'turnstile-token',
		}, { ipAddress: '203.0.113.10' })).rejects.toThrow('Security check failed. Please retry.');

		expect(repo.findDeviceById).not.toHaveBeenCalled();
	});

	it('validates Turnstile before admin OTP request side effects', async () => {
		const fetchMock = mockTurnstileSuccess('admin-otp-request');
		repo.findOtpByDeviceAndEmail.mockResolvedValue(null);
		const service = makeService();

		await service.requestAdminOtp({
			email: user.email,
			turnstileToken: 'admin-turnstile-token',
		}, { ipAddress: '198.51.100.4' });

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toMatchObject({
			response: 'admin-turnstile-token',
			remoteip: '198.51.100.4',
		});
		expect(repo.createOtp).toHaveBeenCalled();
	});
});
