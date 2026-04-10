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
	updateOtp,
	createOtp,
	updateAuthLastRefresh,
	findAuthByDeviceId
} from '../repositories';
import { z } from 'zod';
import { OtpService } from "./otp.service";
import { JwtService } from "./jwt.service";
import { EmailService } from "./email.service";
import { logger } from "common-pack/logger";

const MAX_ACTIVE_DEVICES = 1;

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

	async requestOtp(input: z.infer<typeof requestOtpDto>) {
		logger.info("Requesting OTP", { email: input.email, deviceId: input.deviceUuId });
		const normalizedEmail = this.normalizeEmail(input.email);
		const deviceExists = await findDeviceById(this.db, input.deviceUuId);

		if (!deviceExists) {
			logger.warn("Device not found during OTP request", { deviceId: input.deviceUuId });
			throw new ORPCError("NOT_FOUND", { message: "Device not found" });
		}

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

		let otpValue: number;
		if (normalizedEmail === this.env.TEST_EMAIL) {
			otpValue = parseInt(this.env.TEST_OTP);
		} else if (existingOtp && !this.otpService.isExpired(existingOtp)) {
			otpValue = existingOtp.otp;
		} else {
			otpValue = parseInt(this.otpService.generate(5));
		}

		const expiredAt = new Date(Date.now() + 5 * 60 * 1000);
		if (existingOtp) {
			await updateOtp(this.db, existingOtp.id, otpValue, expiredAt);
		} else {
			await createOtp(this.db, crypto.randomUUID(), otpValue, normalizedEmail, input.deviceUuId, expiredAt);
		}

		if (normalizedEmail !== this.env.TEST_EMAIL) {
			await this.emailService.sendOtp(normalizedEmail, otpValue);
		}

		logger.info("OTP sent", { email: normalizedEmail, deviceId: input.deviceUuId });

		return {
			success: true,
			message: "OTP sent successfully",
		};
	}

	async verifyOtp(input: z.infer<typeof verifyOtpDto>) {
		logger.info("Verifying OTP", { email: input.email, deviceId: input.deviceUuId });
		const normalizedEmail = this.normalizeEmail(input.email);
		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
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
			logger.warn("OTP not found", { deviceId: input.deviceUuId, email: normalizedEmail });
			throw new ORPCError("NOT_FOUND", { message: "OTP not found" });
		}

		if (this.otpService.isExpired(otp)) {
			logger.warn("OTP expired", { deviceId: input.deviceUuId, email: normalizedEmail });
			throw new ORPCError("BAD_REQUEST", { message: "OTP expired" });
		}

		if (otp.otp !== input.otp) {
			logger.warn("Invalid OTP provided", { deviceId: input.deviceUuId, email: normalizedEmail });
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

		logger.info("OTP verification successful", { userId: user.id, deviceId: input.deviceUuId });

		return {
			success: true,
			accessToken,
			deviceId: input.deviceUuId,
			message: "OTP verified successfully",
		};
	}

	async requestAdminOtp(input: z.infer<typeof requestAdminOtpDto>) {
		logger.info("Requesting admin OTP", { email: input.email });
		const normalizedEmail = this.normalizeEmail(input.email);
		await this.findOrCreateUser(normalizedEmail);
		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const banned = await checkUserBanStatus(this.db, user);
		if (banned) {
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const pseudoDeviceId = `admin-web:${normalizedEmail}`;
		const existingOtp = await findOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);
		let otpValue: number;

		if (normalizedEmail === this.env.TEST_EMAIL) {
			otpValue = parseInt(this.env.TEST_OTP);
		} else if (existingOtp && !this.otpService.isExpired(existingOtp)) {
			otpValue = existingOtp.otp;
		} else {
			otpValue = parseInt(this.otpService.generate(5));
		}

		const expiredAt = new Date(Date.now() + 5 * 60 * 1000);
		if (existingOtp) {
			await updateOtp(this.db, existingOtp.id, otpValue, expiredAt);
		} else {
			await createOtp(this.db, crypto.randomUUID(), otpValue, normalizedEmail, pseudoDeviceId, expiredAt);
		}

		if (normalizedEmail !== this.env.TEST_EMAIL) {
			await this.emailService.sendOtp(normalizedEmail, otpValue);
		}

		return {
			success: true,
			message: "Admin OTP sent successfully",
		};
	}

	async verifyAdminOtp(input: z.infer<typeof verifyAdminOtpDto>) {
		logger.info("Verifying admin OTP", { email: input.email });
		const normalizedEmail = this.normalizeEmail(input.email);
		const user = await findUserByEmail(this.db, normalizedEmail);

		if (!user) {
			throw new ORPCError("NOT_FOUND", { message: "User not found" });
		}

		const banned = await checkUserBanStatus(this.db, user);
		if (banned) {
			throw new ORPCError("FORBIDDEN", { message: "User account is banned" });
		}

		const pseudoDeviceId = `admin-web:${normalizedEmail}`;
		const otp = await findOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);

		if (!otp) {
			throw new ORPCError("NOT_FOUND", { message: "OTP not found" });
		}
		if (this.otpService.isExpired(otp)) {
			throw new ORPCError("BAD_REQUEST", { message: "OTP expired" });
		}
		if (otp.otp !== input.otp) {
			throw new ORPCError("BAD_REQUEST", { message: "Invalid OTP" });
		}

		await deleteOtpByDeviceAndEmail(this.db, pseudoDeviceId, normalizedEmail);
		await createAuthSession(this.db, crypto.randomUUID(), user.id, `admin-web:${crypto.randomUUID()}`, true);

		const accessToken = await this.jwtService.generateAccessToken(user.id, user.email);

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
