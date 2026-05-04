import { describe, expect, it, vi } from 'vitest';
import { OtpService } from './otp.service';

describe('OtpService', () => {
	it('generates 6-digit numeric OTPs with Web Crypto randomness', () => {
		const spy = vi.spyOn(crypto, 'getRandomValues');
		const service = new OtpService();

		const otp = service.generate();

		expect(otp).toMatch(/^\d{6}$/);
		expect(Number(otp)).toBeGreaterThanOrEqual(100000);
		expect(Number(otp)).toBeLessThanOrEqual(999999);
		expect(spy).toHaveBeenCalled();

		spy.mockRestore();
	});

	it('hashes and verifies OTPs with HMAC-SHA-256', async () => {
		const service = new OtpService();
		const hash = await service.hashOtp('123456', 'test-secret');

		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		await expect(service.verifyOtp('123456', hash, 'test-secret')).resolves.toBe(true);
		await expect(service.verifyOtp('123457', hash, 'test-secret')).resolves.toBe(false);
		await expect(service.verifyOtp('123456', hash, 'other-secret')).resolves.toBe(false);
	});

	it('only enables fixed test OTPs in local development and test environments', () => {
		const service = new OtpService();

		expect(service.isFixedTestOtpEnabled('local')).toBe(true);
		expect(service.isFixedTestOtpEnabled('development')).toBe(true);
		expect(service.isFixedTestOtpEnabled('test')).toBe(true);
		expect(service.isFixedTestOtpEnabled('production')).toBe(false);
		expect(service.isFixedTestOtpEnabled(undefined)).toBe(false);
	});
});
