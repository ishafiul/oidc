import { eq } from 'drizzle-orm';
import { findUserByEmail, createUser, isUserBanned } from '../repositories';
import { findDeviceById } from '../repositories';
import { findOtpByDeviceAndEmail } from '../repositories';
import { findAuthByUserId } from '../repositories';
import { TRPCContext } from "../../../core/context";
import type { InferDocType, InferRelation } from '../../fgac/adapters/IPermissionAdapter';
import { FGAC_CONFIG, type FGACDocType } from '../../fgac/config/fgac.config';
import {
	createPermissionManagementService,
	type PermissionServiceEnv,
} from '../../fgac/services/permission-service.factory';
import { userSubject } from '../../fgac/utils/auth.helpers';
import { Resource } from "permission-manager-worker/src";
import { DB } from "../../../core/db";
import { SelectUser, users } from "../../../core/db/schema";
import {
	createDeviceUuidFullDto,
	requestOtpDto,
	verifyOtpDto,
	logoutDto,
	refreshTokenDto,
	requestAdminOtpDto,
	verifyAdminOtpDto,
} from "../dto";
import { ORPCError } from '@orpc/server';
import {
	findDeviceByFingerprint,
	updateDevice,
	createDevice,
	deleteAuthByDeviceId,
	deleteAuthByUserId,
	findAuthsByUserId,
	createAuthSession,
	findTrustedAuthByDeviceAndUser,
	findUserById,
	checkUserBanStatus,
	deleteOtpByDeviceAndEmail,
	updateOtpChallenge,
	createOtp,
	consumeOtpRateLimit,
	createOtpAttemptEvent,
	recordOtpFailedAttempt,
	updateAuthLastRefresh,
	findAuthByDeviceId,
	type OtpAttemptOutcome,
	type OtpPurpose,
} from '../repositories';
import { z } from 'zod';
import { OtpService } from "./otp.service";
import { JwtService } from "./jwt.service";
import { EmailService } from "./email.service";
import { logger } from "common-pack/logger";

const MAX_ACTIVE_DEVICES = 1;
const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_FAILED_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const RATE_LIMIT_ERROR_MESSAGE = "Too many OTP attempts. Try again later.";
const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ERROR_MESSAGE = 'Security check failed. Please retry.';

export type OtpRequestContext = {
	ipAddress: string;
};

export type OtpVerifyContext = {
	ipAddress: string;
};

type OtpRateLimitAction = 'request' | 'verify';

type TurnstileSiteverifyResponse = {
	success: boolean;
	action?: string;
	'error-codes'?: string[];
};

export class AuthService {
	private otpService: OtpService;
	private jwtService: JwtService;
	private emailService: EmailService;

	constructor(private db: DB, private env: TRPCContext['env']) {
		this.otpService = new OtpService();
		this.jwtService = new JwtService(env.JWT_SECRET);
		this.emailService = new EmailService(env.RESEND_API_KEY);
	}


	private normalizeEmail(email: string): string {
		return email.toLowerCase().trim();
	}

	private normalizeIpAddress(ipAddress: string | undefined): string {
		const firstForwarded = ipAddress?.split(',')[0]?.trim();
		return firstForwarded || 'unknown';
	}

	private getFixedTestOtp(normalizedEmail: string): string | null {
		if (!this.otpService.isFixedTestOtpEnabled(this.env.ENVIRONMENT)) {
			return null;
		}
		if (!this.env.TEST_EMAIL || normalizedEmail !== this.normalizeEmail(this.env.TEST_EMAIL)) {
			return null;
		}
		const configured = this.env.TEST_OTP?.trim();
		return configured && /^\d+$/.test(configured) ? configured : null;
	}

	private async hashOtpValue(value: string): Promise<string> {
		return this.otpService.hashOtp(value, this.env.JWT_SECRET);
	}

	private async hashAuditValue(label: string, value: string): Promise<string> {
		return this.otpService.hashKey(`${label}:${value}`, this.env.JWT_SECRET);
	}

	private isDevelopmentLikeEnvironment(): boolean {
		const environment = this.env.ENVIRONMENT?.trim().toLowerCase();
		return environment === 'development' || environment === 'dev' || environment === 'local' || environment === 'test';
	}

	private async validateTurnstileToken(
		token: string | undefined,
		ipAddress: string,
		expectedAction: 'user-otp-request' | 'admin-otp-request',
	): Promise<void> {
		const secret = this.env.TURNSTILE_SECRET_KEY?.trim();
		if (!secret) {
			if (this.isDevelopmentLikeEnvironment()) {
				return;
			}
			logger.error('Turnstile secret is not configured');
			throw new ORPCError('BAD_REQUEST', { message: TURNSTILE_ERROR_MESSAGE });
		}

		const responseToken = token?.trim();
		if (!responseToken) {
			throw new ORPCError('BAD_REQUEST', { message: TURNSTILE_ERROR_MESSAGE });
		}

		try {
			const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					secret,
					response: responseToken,
					remoteip: this.normalizeIpAddress(ipAddress),
					idempotency_key: crypto.randomUUID(),
				}),
			});
			const result = (await response.json()) as TurnstileSiteverifyResponse;
			const actionMismatch = result.action !== undefined && result.action !== expectedAction;
			if (!response.ok || !result.success || actionMismatch) {
				logger.warn('Turnstile validation failed', {
					action: result.action,
					expectedAction,
					errorCodes: result['error-codes'] ?? [],
				});
				throw new ORPCError('BAD_REQUEST', { message: TURNSTILE_ERROR_MESSAGE });
			}
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			logger.warn('Turnstile validation request failed', { error: error instanceof Error ? error.message : String(error) });
			throw new ORPCError('BAD_REQUEST', { message: TURNSTILE_ERROR_MESSAGE });
		}
	}

	private async auditOtpEvent(
		purpose: OtpPurpose,
		outcome: OtpAttemptOutcome,
		input: { email: string; deviceId: string; ipAddress: string },
		now = new Date(),
	): Promise<void> {
		await createOtpAttemptEvent(this.db, {
			id: crypto.randomUUID(),
			purpose,
			outcome,
			emailHash: await this.hashAuditValue('otp-audit-email', input.email),
			deviceHash: await this.hashAuditValue('otp-audit-device', input.deviceId),
			ipHash: await this.hashAuditValue('otp-audit-ip', this.normalizeIpAddress(input.ipAddress)),
			createdAt: now,
		});
	}

	private async enforceOtpRateLimits(
		purpose: OtpPurpose,
		action: OtpRateLimitAction,
		input: { email: string; deviceId: string; ipAddress: string },
		now = new Date(),
	): Promise<void> {
		const ipAddress = this.normalizeIpAddress(input.ipAddress);
		const limits =
			action === 'request'
				? [
					{ dimension: 'email', value: input.email, limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
					{ dimension: 'device', value: input.deviceId, limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
					{ dimension: 'ip', value: ipAddress, limit: 30, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
				]
				: [
					{ dimension: 'email', value: input.email, limit: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
					{ dimension: 'device', value: input.deviceId, limit: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
					{ dimension: 'ip', value: ipAddress, limit: 50, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 },
				];

		for (const limit of limits) {
			const scope = `otp:${purpose}:${action}:${limit.dimension}`;
			const keyHash = await this.hashAuditValue(`otp-rate:${scope}`, limit.value);
			const result = await consumeOtpRateLimit(this.db, {
				scope,
				keyHash,
				limit: limit.limit,
				windowMs: limit.windowMs,
				blockMs: limit.blockMs,
				now,
			});
			if (!result.allowed) {
				await this.auditOtpEvent(
					purpose,
					action === 'request' ? 'request_rate_limited' : 'verify_rate_limited',
					{ ...input, ipAddress },
					now,
				);
				throw new ORPCError("FORBIDDEN", { message: RATE_LIMIT_ERROR_MESSAGE });
			}
		}
	}

	private async resolveOtpCode(normalizedEmail: string): Promise<string> {
		return this.getFixedTestOtp(normalizedEmail) ?? this.otpService.generate(OTP_LENGTH);
	}

	private shouldSendOtpEmail(normalizedEmail: string): boolean {
		return this.getFixedTestOtp(normalizedEmail) === null;
	}

	private assertOtpRequestCooldown(
		otp: { lastRequestAt: Date | null } | undefined,
		purpose: OtpPurpose,
		input: { email: string; deviceId: string; ipAddress: string },
		now: Date,
	): Promise<void> | void {
		if (!otp?.lastRequestAt) {
			return;
		}
		if (otp.lastRequestAt.getTime() + OTP_RESEND_COOLDOWN_MS <= now.getTime()) {
			return;
		}
		return this.auditOtpEvent(purpose, 'request_rate_limited', input, now).then(() => {
			throw new ORPCError("FORBIDDEN", { message: RATE_LIMIT_ERROR_MESSAGE });
		});
	}

	private async storeOtp(
		input: {
			existingOtp: Awaited<ReturnType<typeof findOtpByDeviceAndEmail>>;
			email: string;
			deviceId: string;
			otpCode: string;
			now: Date;
		},
	): Promise<void> {
		const otpHash = await this.hashOtpValue(input.otpCode);
		const expiredAt = new Date(input.now.getTime() + OTP_TTL_MS);

		if (input.existingOtp) {
			await updateOtpChallenge(this.db, input.existingOtp.id, {
				otpHash,
				expiredAt,
				lastRequestAt: input.now,
			});
			return;
		}

		await createOtp(this.db, {
			id: crypto.randomUUID(),
			otpHash,
			email: input.email,
			deviceUuId: input.deviceId,
			expiredAt,
			lastRequestAt: input.now,
		});
	}
	async registerDevice(fullInput: z.infer<typeof createDeviceUuidFullDto>) {
		logger.info("Registering device", { deviceType: fullInput.deviceType, model: fullInput.deviceModel });
		const fingerprintComponents = [
			fullInput.ipAddress || "",
			fullInput.deviceType || "",
			fullInput.deviceModel || "",
			fullInput.osName || "",
			fullInput.countryCode || "",
			fullInput.timezone || "",
		].join("|");

		const fingerprintBuffer = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(fingerprintComponents)
		);
		const fingerprint = Array.from(new Uint8Array(fingerprintBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const existingDevice = await findDeviceByFingerprint(this.db, fingerprint);

		if (existingDevice) {
			const updateData = {
				deviceType: fullInput.deviceType,
				deviceModel: fullInput.deviceModel,
				osName: fullInput.osName,
				osVersion: fullInput.osVersion,
				isPhysicalDevice: fullInput.isPhysicalDevice ? "true" : "false",
				appVersion: fullInput.appVersion,
				ipAddress: fullInput.ipAddress,
				city: fullInput.city,
				countryCode: fullInput.countryCode,
				isp: fullInput.isp,
				colo: fullInput.colo,
				timezone: fullInput.timezone,
				longitude: fullInput.longitude,
				latitude: fullInput.latitude,
				fcmToken: fullInput.fcmToken ?? undefined,
			};

			await updateDevice(this.db, existingDevice.id, updateData);

			return {
				deviceId: existingDevice.id,
			};
		}

		const deviceId = crypto.randomUUID();

		const createData = {
			id: deviceId,
			fingerprint,
			deviceType: fullInput.deviceType,
			deviceModel: fullInput.deviceModel,
			osName: fullInput.osName,
			osVersion: fullInput.osVersion,
			isPhysicalDevice: fullInput.isPhysicalDevice ? "true" : "false",
			appVersion: fullInput.appVersion,
			ipAddress: fullInput.ipAddress,
			city: fullInput.city,
			countryCode: fullInput.countryCode,
			isp: fullInput.isp,
			colo: fullInput.colo,
			timezone: fullInput.timezone,
			longitude: fullInput.longitude,
			latitude: fullInput.latitude,
			fcmToken: fullInput.fcmToken ?? undefined,
		};

		await createDevice(this.db, createData);

		return {
			deviceId,
		};
	}

	async requestOtp(input: z.infer<typeof requestOtpDto>, context: OtpRequestContext = { ipAddress: 'unknown' }) {
		logger.info("Requesting OTP", { email: input.email, deviceId: input.deviceUuId });
		const normalizedEmail = this.normalizeEmail(input.email);
		const ipAddress = this.normalizeIpAddress(context.ipAddress);
		const now = new Date();
		await this.validateTurnstileToken(input.turnstileToken, ipAddress, 'user-otp-request');
		const deviceExists = await findDeviceById(this.db, input.deviceUuId);

		if (!deviceExists) {
			logger.warn("Device not found during OTP request", { deviceId: input.deviceUuId });
			throw new ORPCError("NOT_FOUND", { message: "Device not found" });
		}

		await this.enforceOtpRateLimits('user', 'request', {
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			ipAddress,
		}, now);

		await this.findOrCreateUser(normalizedEmail);
		const user = await findUserByEmail(this.db, normalizedEmail);
		if (!user) {
			logger.warn("User not found during OTP request", { email: normalizedEmail });
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const trustedAuth = await findTrustedAuthByDeviceAndUser(this.db, input.deviceUuId, user.id);
		const banned = await checkUserBanStatus(this.db, user);

		if (banned) {
			logger.warn("Banned user attempted OTP request", { userId: user.id });
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		if (trustedAuth) {

			await deleteAuthByDeviceId(this.db, input.deviceUuId);
			const activeSessions = await findAuthsByUserId(this.db, user.id);
			if (activeSessions.length >= MAX_ACTIVE_DEVICES) {
				await deleteAuthByUserId(this.db, user.id);
			}

			await createAuthSession(this.db, crypto.randomUUID(), user.id, input.deviceUuId, true);
			const accessToken = await this.jwtService.generateAccessToken(user.id, user.email);

			logger.info("Trusted device login successful", { userId: user.id, deviceId: input.deviceUuId });

			return {
				success: true,
				message: "Logged in with trusted device",
				accessToken,
				deviceId: input.deviceUuId,
			};
		}


		await deleteAuthByDeviceId(this.db, input.deviceUuId);
		const existingOtp = await findOtpByDeviceAndEmail(this.db, input.deviceUuId, normalizedEmail);
		await this.assertOtpRequestCooldown(existingOtp, 'user', {
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			ipAddress,
		}, now);

		const otpCode = await this.resolveOtpCode(normalizedEmail);
		await this.storeOtp({
			existingOtp,
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			otpCode,
			now,
		});

		if (this.shouldSendOtpEmail(normalizedEmail)) {
			await this.emailService.sendOtp(normalizedEmail, otpCode);
		}

		await this.auditOtpEvent('user', 'requested', {
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			ipAddress,
		}, now);
		logger.info("OTP sent", { email: normalizedEmail, deviceId: input.deviceUuId });

		return {
			success: true,
			message: "OTP sent successfully",
		};
	}

	async verifyOtp(input: z.infer<typeof verifyOtpDto>, context: OtpVerifyContext = { ipAddress: 'unknown' }) {
		logger.info("Verifying OTP", { email: input.email, deviceId: input.deviceUuId });
		const normalizedEmail = this.normalizeEmail(input.email);
		const ipAddress = this.normalizeIpAddress(context.ipAddress);
		const now = new Date();

		await this.enforceOtpRateLimits('user', 'verify', {
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			ipAddress,
		}, now);

		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
			await this.auditOtpEvent('user', 'not_found', {
				email: normalizedEmail,
				deviceId: input.deviceUuId,
				ipAddress,
			}, now);
			logger.warn("User not found during OTP verify", { email: normalizedEmail });
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const banned = await checkUserBanStatus(this.db, user);
		if (banned) {
			logger.warn("Banned user attempted OTP verify", { userId: user.id });
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const otp = await findOtpByDeviceAndEmail(this.db, input.deviceUuId, normalizedEmail);

		if (!otp) {
			await this.auditOtpEvent('user', 'not_found', {
				email: normalizedEmail,
				deviceId: input.deviceUuId,
				ipAddress,
			}, now);
			logger.warn("OTP not found", { deviceId: input.deviceUuId, email: normalizedEmail });
			throw new ORPCError("NOT_FOUND", { message: "OTP not found" });
		}

		if (this.otpService.isLocked(otp, now)) {
			await this.auditOtpEvent('user', 'locked', {
				email: normalizedEmail,
				deviceId: input.deviceUuId,
				ipAddress,
			}, now);
			logger.warn("OTP locked", { deviceId: input.deviceUuId, email: normalizedEmail });
			throw new ORPCError("FORBIDDEN", { message: "OTP is locked. Try again later." });
		}

		if (this.otpService.isExpired(otp)) {
			await this.auditOtpEvent('user', 'expired', {
				email: normalizedEmail,
				deviceId: input.deviceUuId,
				ipAddress,
			}, now);
			logger.warn("OTP expired", { deviceId: input.deviceUuId, email: normalizedEmail });
			throw new ORPCError("BAD_REQUEST", { message: "OTP expired" });
		}

		const validOtp = await this.otpService.verifyOtp(input.otp, otp.otpHash, this.env.JWT_SECRET);
		if (!validOtp) {
			const nextFailedAttempts = otp.failedAttempts + 1;
			const lockedUntil =
				nextFailedAttempts >= OTP_MAX_FAILED_ATTEMPTS
					? new Date(now.getTime() + OTP_LOCKOUT_MS)
					: null;
			await recordOtpFailedAttempt(this.db, otp.id, {
				now,
				lockedUntil,
			});
			await this.auditOtpEvent(
				'user',
				lockedUntil ? 'locked_after_invalid' : 'invalid',
				{
					email: normalizedEmail,
					deviceId: input.deviceUuId,
					ipAddress,
				},
				now,
			);
			logger.warn("Invalid OTP provided", { deviceId: input.deviceUuId, email: normalizedEmail });
			if (lockedUntil) {
				throw new ORPCError("FORBIDDEN", { message: "OTP is locked. Try again later." });
			}
			throw new ORPCError("BAD_REQUEST", { message: "Invalid OTP" });
		}

		await deleteOtpByDeviceAndEmail(this.db, input.deviceUuId, normalizedEmail);

		const activeSessions = await findAuthsByUserId(this.db, user.id);
		if (activeSessions.length >= MAX_ACTIVE_DEVICES) {
			await deleteAuthByUserId(this.db, user.id);
		}

		const isTrusted = input.isTrusted ?? false;
		await createAuthSession(this.db, crypto.randomUUID(), user.id, input.deviceUuId, isTrusted);

		const accessToken = await this.jwtService.generateAccessToken(user.id, user.email);

		await this.auditOtpEvent('user', 'verified', {
			email: normalizedEmail,
			deviceId: input.deviceUuId,
			ipAddress,
		}, now);
		logger.info("OTP verification successful", { userId: user.id, deviceId: input.deviceUuId });

		return {
			success: true,
			accessToken,
			deviceId: input.deviceUuId,
			message: "OTP verified successfully",
		};
	}

	async requestAdminOtp(input: z.infer<typeof requestAdminOtpDto>, context: OtpRequestContext = { ipAddress: 'unknown' }) {
		logger.info("Requesting admin OTP", { email: input.email });
		const normalizedEmail = this.normalizeEmail(input.email);
		const ipAddress = this.normalizeIpAddress(context.ipAddress);
		const now = new Date();
		const pseudoDeviceId = `admin-web:${normalizedEmail}`;
		await this.validateTurnstileToken(input.turnstileToken, ipAddress, 'admin-otp-request');
		await this.enforceOtpRateLimits('admin', 'request', {
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			ipAddress,
		}, now);

		await this.findOrCreateUser(normalizedEmail);
		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const banned = await checkUserBanStatus(this.db, user);
		if (banned) {
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const existingOtp = await findOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);
		await this.assertOtpRequestCooldown(existingOtp, 'admin', {
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			ipAddress,
		}, now);

		const otpCode = await this.resolveOtpCode(normalizedEmail);
		await this.storeOtp({
			existingOtp,
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			otpCode,
			now,
		});

		if (this.shouldSendOtpEmail(normalizedEmail)) {
			await this.emailService.sendOtp(normalizedEmail, otpCode);
		}

		await this.auditOtpEvent('admin', 'requested', {
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			ipAddress,
		}, now);
		return {
			success: true,
			message: "Admin OTP sent successfully",
		};
	}

	async verifyAdminOtp(input: z.infer<typeof verifyAdminOtpDto>, context: OtpVerifyContext = { ipAddress: 'unknown' }) {
		logger.info("Verifying admin OTP", { email: input.email });
		const normalizedEmail = this.normalizeEmail(input.email);
		const ipAddress = this.normalizeIpAddress(context.ipAddress);
		const now = new Date();
		const pseudoDeviceId = `admin-web:${normalizedEmail}`;
		await this.enforceOtpRateLimits('admin', 'verify', {
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			ipAddress,
		}, now);

		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
			await this.auditOtpEvent('admin', 'not_found', {
				email: normalizedEmail,
				deviceId: pseudoDeviceId,
				ipAddress,
			}, now);
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const banned = await checkUserBanStatus(this.db, user);
		if (banned) {
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const otp = await findOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);

		if (!otp) {
			await this.auditOtpEvent('admin', 'not_found', {
				email: normalizedEmail,
				deviceId: pseudoDeviceId,
				ipAddress,
			}, now);
			throw new ORPCError("NOT_FOUND", { message: "OTP not found" });
		}
		if (this.otpService.isLocked(otp, now)) {
			await this.auditOtpEvent('admin', 'locked', {
				email: normalizedEmail,
				deviceId: pseudoDeviceId,
				ipAddress,
			}, now);
			throw new ORPCError("FORBIDDEN", { message: "OTP is locked. Try again later." });
		}
		if (this.otpService.isExpired(otp)) {
			await this.auditOtpEvent('admin', 'expired', {
				email: normalizedEmail,
				deviceId: pseudoDeviceId,
				ipAddress,
			}, now);
			throw new ORPCError("BAD_REQUEST", { message: "OTP expired" });
		}
		const validOtp = await this.otpService.verifyOtp(input.otp, otp.otpHash, this.env.JWT_SECRET);
		if (!validOtp) {
			const nextFailedAttempts = otp.failedAttempts + 1;
			const lockedUntil =
				nextFailedAttempts >= OTP_MAX_FAILED_ATTEMPTS
					? new Date(now.getTime() + OTP_LOCKOUT_MS)
					: null;
			await recordOtpFailedAttempt(this.db, otp.id, {
				now,
				lockedUntil,
			});
			await this.auditOtpEvent(
				'admin',
				lockedUntil ? 'locked_after_invalid' : 'invalid',
				{
					email: normalizedEmail,
					deviceId: pseudoDeviceId,
					ipAddress,
				},
				now,
			);
			if (lockedUntil) {
				throw new ORPCError("FORBIDDEN", { message: "OTP is locked. Try again later." });
			}
			throw new ORPCError("BAD_REQUEST", { message: "Invalid OTP" });
		}

		await deleteOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);
		await createAuthSession(this.db, crypto.randomUUID(), user.id, `admin-web:${crypto.randomUUID()}`, true);

		const accessToken = await this.jwtService.generateAccessToken(user.id, user.email);

		await this.auditOtpEvent('admin', 'verified', {
			email: normalizedEmail,
			deviceId: pseudoDeviceId,
			ipAddress,
		}, now);
		return {
			success: true,
			message: "Admin OTP verified successfully",
			accessToken,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
		};
	}

	async logout(input: z.infer<typeof logoutDto>, authUser: { id: string }) {
		logger.info("Logout requested", { deviceId: input.deviceId, userId: authUser.id });
		if (!authUser) {
			logger.error("Logout called without correct authUser context");
			throw new ORPCError("UNAUTHORIZED", { message: "User not authenticated" });
		}

		const auth = await findAuthByDeviceId(this.db, input.deviceId);

		if (!auth) {
			throw new ORPCError("NOT_FOUND", { message: "Auth session not found" });
		}

		if (auth.userId !== authUser.id) {
			logger.warn("Unauthorized logout attempt", { requestUserId: authUser.id, targetDeviceId: input.deviceId });
			throw new ORPCError("FORBIDDEN", { message: "Unauthorized to logout this device" });
		}

		if (!auth.isTrusted) {
			await deleteAuthByDeviceId(this.db, input.deviceId);
		}
		logger.info("Logout successful", { deviceId: input.deviceId, userId: authUser.id });

		return { success: true };
	}

	async refreshToken(input: z.infer<typeof refreshTokenDto>, authHeader: string | null) {
		logger.info("Token refresh requested", { deviceId: input.deviceId });
		const auth = await findAuthByDeviceId(this.db, input.deviceId);
		if (!auth) {
			logger.warn("Auth session not found during refresh", { deviceId: input.deviceId });
			throw new ORPCError("NOT_FOUND", { message: "Auth session not found" });
		}

		if (!authHeader) throw new ORPCError("UNAUTHORIZED", { message: "No token provided" });
		const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
		if (!token) throw new ORPCError("UNAUTHORIZED", { message: "No token provided" });

		const foundUser = await findUserById(this.db, auth.userId);
		if (!foundUser) throw new ORPCError("NOT_FOUND", { message: "User not found" });

		const banned = await checkUserBanStatus(this.db, foundUser);
		if (banned) {
			logger.warn("Banned user attempted token refresh", { userId: foundUser.id });
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const payload = await this.jwtService.verifyToken(token).catch((err) => {
			logger.warn("Invalid token during refresh", { error: err.message, deviceId: input.deviceId });
			throw new ORPCError("UNAUTHORIZED", { message: "Invalid or expired token" });
		});

		if (payload.userId !== auth.userId) {
			logger.warn("Device mismatch during refresh", { tokenUserId: payload.userId, authUserId: auth.userId });
			throw new ORPCError("FORBIDDEN", { message: "Device does not belong to authenticated user" });
		}


		const lastRefreshDate = auth.lastRefresh ?? new Date(0);
		const currentDateTime = new Date();
		const maxValidTime = new Date(lastRefreshDate.getTime() + 7 * 24 * 60 * 60 * 1000);

		if (currentDateTime >= maxValidTime) {
			logger.warn("Session expired during refresh", { deviceId: auth.id, lastRefresh: lastRefreshDate });
			throw new ORPCError("UNAUTHORIZED", { message: "Session expired" });
		}

		await updateAuthLastRefresh(this.db, auth.id);
		const accessToken = await this.jwtService.generateAccessToken(auth.userId, foundUser.email);

		return { accessToken };
	}

	async validateUser(userId: string): Promise<SelectUser> {
		const [foundUser] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

		if (!foundUser) {
			throw new Error('User not found');
		}

		const banned = await isUserBanned(this.db, userId);
		if (banned) {
			throw new Error('User account is banned');
		}

		const authSession = await findAuthByUserId(this.db, userId);
		if (!authSession) {
			throw new Error('Session not found or expired');
		}

		return foundUser;
	}


	private async findOrCreateUser(email: string): Promise<{ id: string; email: string; name: string | null }> {
		const normalizedEmail = this.normalizeEmail(email);
		const existingUser = await findUserByEmail(this.db, normalizedEmail);

		if (existingUser) {
			return existingUser;
		}

		const newUserId = crypto.randomUUID();
		const newUser = await createUser(this.db, newUserId, normalizedEmail, null);

		const typedEnv = this.env as unknown as PermissionServiceEnv<typeof FGAC_CONFIG>;
		const permissionService = createPermissionManagementService(typedEnv, FGAC_CONFIG);
		const connectionTest = await permissionService.testConnection();

		if (!connectionTest.ok || !connectionTest.hasKV) {
			const errorMsg = `Permission service connection test failed: ${JSON.stringify(connectionTest)}`;
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		const userResource: Resource<FGACDocType> = { type: 'user', id: newUserId };

		const grantResult = await permissionService.grant(
			userSubject(newUserId),
			'member' as InferRelation<typeof FGAC_CONFIG>,
			userResource
		);

		if (!grantResult || !grantResult.ok) {
			const errorMsg = `grant returned unexpected result: ${JSON.stringify(grantResult)}`;
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		return newUser;
	}
}


export async function validateUser(ctx: TRPCContext, userId: string) {
	const service = new AuthService(ctx.c.get('db'), ctx.env);
	return service.validateUser(userId);
}

export async function extractAndVerifyToken(authHeader: string | null | undefined, jwtSecret: string) {
	if (!authHeader) throw new Error('No authorization header');
	const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
	if (!token) throw new Error('No token provided');


	const service = new JwtService(jwtSecret);
	return service.verifyToken(token);
}
