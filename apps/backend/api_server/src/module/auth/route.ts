import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
    createDeviceUuidApiDto,
    createDeviceUuidFullDto,
    requestOtpDto,
    verifyOtpDto,
    logoutDto,
    refreshTokenDto,
    createDeviceUuidResponseDto,
    requestOtpResponseDto,
    verifyOtpResponseDto,
    logoutResponseDto,
    refreshTokenResponseDto,
    requestAdminOtpDto,
    verifyAdminOtpDto,
    requestAdminOtpResponseDto,
    verifyAdminOtpResponseDto,
    adminSessionResponseDto,
    createOidcAuthorizeSessionResponseDto,
} from "./dto";
import { protectedProcedure, publicProcedure } from "../../procedure";
import { getTRPCContext } from "../../core/context";
import { AuthService } from "./services/auth.service";
import { logger } from "common-pack/logger";
import { clearAdminAuthCookies, getAuthTokenFromRequest, setAdminAuthCookies } from "./session";
import { extractAndVerifyToken, validateUser } from "../../core/utils/auth";
import { ProjectsService } from "../projects/service";
import { OidcService } from "../oidc/service";

const OPENAPI_TAG = "Auth";

function getAuthHeader(authHeader: string | null | undefined): string | null {
    if (!authHeader) return null;
    return authHeader;
}

function getRequestIp(ctx: ReturnType<typeof getTRPCContext>): string {
    return (
        ctx.c.req.header("cf-connecting-ip") ||
        ctx.c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
    );
}

export const authRoutes = {
    requestAdminOtp: publicProcedure
        .route({
            method: "POST",
            path: "/auth/admin/otp/request",
            tags: [OPENAPI_TAG],
            inputStructure: "detailed",
        })
        .input(z.object({
            body: requestAdminOtpDto,
        }))
        .output(requestAdminOtpResponseDto)
        .handler(async ({ input, context }) => {
            const ctx = getTRPCContext(context);
            const service = new AuthService(ctx.get("db"), ctx.env);
            return service.requestAdminOtp(input.body, { ipAddress: getRequestIp(ctx) });
        }),

    verifyAdminOtp: publicProcedure
        .route({
            method: "POST",
            path: "/auth/admin/otp/verify",
            tags: [OPENAPI_TAG],
            inputStructure: "detailed",
        })
        .input(z.object({
            body: verifyAdminOtpDto,
        }))
        .output(verifyAdminOtpResponseDto)
        .handler(async ({ input, context }) => {
            const ctx = getTRPCContext(context);
            const service = new AuthService(ctx.get("db"), ctx.env);
            const result = await service.verifyAdminOtp(input.body, { ipAddress: getRequestIp(ctx) });
            const projectsService = new ProjectsService(ctx.get("db"), ctx.env);
            await projectsService.acceptPendingInvitations(result.user.email, result.user.id);
            const csrfToken = setAdminAuthCookies(ctx.c, result.accessToken);
            return {
                success: result.success,
                message: result.message,
                accessToken: result.accessToken,
                csrfToken,
                user: result.user,
            };
        }),

    getAdminSession: publicProcedure
        .route({
            method: "GET",
            path: "/auth/admin/session",
            tags: [OPENAPI_TAG],
        })
        .output(adminSessionResponseDto)
        .handler(async ({ context }) => {
            const ctx = getTRPCContext(context);
            const token = getAuthTokenFromRequest(ctx.c);

            if (!token) {
                return {
                    authenticated: false,
                    user: null,
                };
            }

            try {
                const payload = await extractAndVerifyToken(token, ctx.env.JWT_SECRET ?? "");
                const user = await validateUser(ctx, payload.userId);

                return {
                    authenticated: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                    },
                };
            } catch {
                return {
                    authenticated: false,
                    user: null,
                };
            }
        }),

    adminLogout: publicProcedure
        .route({
            method: "POST",
            path: "/auth/admin/logout",
            tags: [OPENAPI_TAG],
        })
        .output(logoutResponseDto)
        .handler(async ({ context }) => {
            const ctx = getTRPCContext(context);
            clearAdminAuthCookies(ctx.c);
            return { success: true };
        }),

    createDeviceUuid: publicProcedure
        .route({
            method: "POST",
            path: "/auth/create-device-uuid",
            tags: [OPENAPI_TAG],
            inputStructure: "detailed"
        })
        .input(z.object({
            body: createDeviceUuidApiDto
        }))
        .output(createDeviceUuidResponseDto)
        .handler(async ({ input, context }) => {
            logger.debug("createDeviceUuid handler called");
            const ctx = getTRPCContext(context);
            const db = ctx.get("db");
            const c = ctx.c;

            const rawRequest = c.req.raw as { cf?: Record<string, unknown> };
            const cfData = rawRequest?.cf || {};



            const fullInput = createDeviceUuidFullDto.parse({
                ...input.body,
                ipAddress: c.req.header("cf-connecting-ip") || undefined,
                isp: cfData["asOrganization"] || undefined,
                colo: cfData["colo"] || undefined,
                longitude: cfData["longitude"]?.toString() || undefined,
                latitude: cfData["latitude"]?.toString() || undefined,
                timezone: cfData["timezone"] || undefined,
                countryCode: cfData["country"] || undefined,
                city: cfData["city"] || undefined,
            });

            const service = new AuthService(db, ctx.env);
            return service.registerDevice(fullInput);
        }),

    requestOtp: publicProcedure
        .route({
            method: "POST",
            path: "/auth/otp/request-otp",
            tags: [OPENAPI_TAG],
            inputStructure: 'detailed'
        })
        .input(z.object({
            body: requestOtpDto
        }))
        .output(requestOtpResponseDto)
        .handler(async ({ input, context }) => {
            logger.debug("requestOtp handler called");
            const ctx = getTRPCContext(context);

            const service = new AuthService(ctx.get("db"), ctx.env);
            return service.requestOtp(input.body, { ipAddress: getRequestIp(ctx) });
        }),

    verifyOtp: publicProcedure
        .route({
            method: "POST",
            path: "/auth/otp/verify-otp",
            tags: [OPENAPI_TAG],
            inputStructure: 'detailed'
        })
        .input(z.object({
            body: verifyOtpDto
        }))
        .output(verifyOtpResponseDto)
        .handler(async ({ input, context }) => {
            logger.debug("verifyOtp handler called");
            const ctx = getTRPCContext(context);
            const service = new AuthService(ctx.get("db"), ctx.env);
            return service.verifyOtp(input.body, { ipAddress: getRequestIp(ctx) });
        }),

    createOidcAuthorizeSession: publicProcedure
        .route({
            method: "POST",
            path: "/auth/oidc/authorize-session",
            tags: [OPENAPI_TAG],
        })
        .output(createOidcAuthorizeSessionResponseDto)
        .handler(async ({ context }) => {
            const ctx = getTRPCContext(context);
            const token = getAuthTokenFromRequest(ctx.c);
            if (!token) {
                throw new ORPCError("UNAUTHORIZED", { message: "No token provided" });
            }
            const payload = await extractAndVerifyToken(token, ctx.env.JWT_SECRET ?? "");
            await validateUser(ctx, payload.userId);
            const oidc = new OidcService(ctx.get("db"), ctx.env);
            return oidc.createAuthorizeSession(payload.userId);
        }),

    logout: protectedProcedure({ anyOf: ["user"], resourceType: "user" })
        .route({ method: "POST", path: "/auth/logout", tags: [OPENAPI_TAG], inputStructure: 'detailed' })
        .input(z.object({
            body: logoutDto
        }))
        .output(logoutResponseDto)
        .handler(async ({ input, context }) => {
            logger.debug("logout handler called");
            const ctx = getTRPCContext(context);
            const authUser = ctx.get("user");

            if (!authUser) {
                throw new ORPCError("UNAUTHORIZED", { message: "User not authenticated" });
            }

            const service = new AuthService(ctx.get("db"), ctx.env);

            return service.logout(input.body, authUser);
        }),

    refreshToken: publicProcedure
        .route({ method: "POST", path: "/auth/refresh-token", tags: [OPENAPI_TAG], inputStructure: 'detailed' })
        .input(z.object({
            body: refreshTokenDto
        }))
        .output(refreshTokenResponseDto)
        .handler(async ({ input, context }) => {
            logger.debug("refreshToken handler called");
            const ctx = getTRPCContext(context);
            const authHeader = getAuthHeader(ctx.c.req.header("Authorization"));

            const service = new AuthService(ctx.get("db"), ctx.env);
            return service.refreshToken(input.body, authHeader);
        }),
};
