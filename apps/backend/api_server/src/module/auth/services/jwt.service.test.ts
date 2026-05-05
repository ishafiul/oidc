import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';
import { JwtService } from './jwt.service';

function decodePayload(token: string) {
	const payloadSegment = token.split('.')[1];
	if (!payloadSegment) throw new Error('Missing payload');
	const padded = payloadSegment.padEnd(payloadSegment.length + (4 - payloadSegment.length % 4) % 4, '=');
	const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
	return JSON.parse(atob(base64)) as Record<string, unknown>;
}

describe('JwtService session claims', () => {
	it('generates access tokens bound to one auth session and device', async () => {
		const service = new JwtService('test-secret');

		const token = await service.generateAccessToken({
			userId: 'user-1',
			email: 'user@example.com',
			sessionId: 'auth-1',
			deviceId: 'device-1',
		});

		const payload = decodePayload(token);
		expect(payload).toMatchObject({
			userId: 'user-1',
			email: 'user@example.com',
			sessionId: 'auth-1',
			deviceId: 'device-1',
			jti: 'auth-1',
			type: 'access',
		});
	});

	it('rejects access tokens without exact session claims', async () => {
		const service = new JwtService('test-secret');
		const token = await sign({
			userId: 'user-1',
			email: 'user@example.com',
			exp: Math.floor(Date.now() / 1000) + 60,
			iat: Math.floor(Date.now() / 1000),
			type: 'access',
		}, 'test-secret', 'HS256');

		await expect(service.verifyToken(token)).rejects.toThrow('Invalid access token claims');
	});

	it('rejects tokens where jti does not match the session id', async () => {
		const service = new JwtService('test-secret');
		const token = await sign({
			userId: 'user-1',
			email: 'user@example.com',
			sessionId: 'auth-1',
			deviceId: 'device-1',
			jti: 'auth-2',
			exp: Math.floor(Date.now() / 1000) + 60,
			iat: Math.floor(Date.now() / 1000),
			type: 'access',
		}, 'test-secret', 'HS256');

		await expect(service.verifyToken(token)).rejects.toThrow('Invalid access token claims');
	});
});
