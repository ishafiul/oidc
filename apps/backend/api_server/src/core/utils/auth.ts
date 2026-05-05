
// ============================================
// Public API
// ============================================

import {TRPCContext} from "../context";
import {SelectUser, users} from "../db/schema";
import {eq} from "drizzle-orm";
import {findActiveAuthSession, isUserBanned} from "../../module/auth/repositories";
import { JwtService, type AccessTokenPayload } from "../../module/auth/services/jwt.service";

const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================
// User Validation
// ============================================

/**
 * Validate that a user exists, is not banned, and has an active session
 * Returns the full user object from the database
 */
export async function validateUser(
    ctx: TRPCContext,
    payload: AccessTokenPayload
): Promise<SelectUser> {
    const { c } = ctx;
    const db = c.get('db');
    const userId = payload.userId;

    const [foundUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!foundUser) {
        throw new Error('User not found');
    }

    const banned = await isUserBanned(db, userId);
    if (banned) {
        throw new Error('User account is banned');
    }

    const authSession = await findActiveAuthSession(db, {
        userId,
        sessionId: payload.sessionId,
        deviceId: payload.deviceId,
    });
    if (!authSession) {
        throw new Error('Session not found or expired');
    }

    const lastRefreshDate = authSession.lastRefresh ?? new Date(0);
    const maxValidTime = new Date(lastRefreshDate.getTime() + AUTH_SESSION_TTL_MS);
    if (new Date() >= maxValidTime) {
        throw new Error('Session not found or expired');
    }

    return foundUser;
}

// ============================================
// JWT Token Handling
// ============================================

/**
 * Verify JWT token and extract payload
 */
async function verifyToken(
    token: string,
    jwtSecret: string
): Promise<AccessTokenPayload> {
    const service = new JwtService(jwtSecret);
    return service.verifyToken(token);
}

/**
 * Extract and verify token from Authorization header
 */
export async function extractAndVerifyToken(
    authHeader: string | null | undefined,
    jwtSecret: string
): Promise<AccessTokenPayload> {
    if (!authHeader) {
        throw new Error('No authorization header');
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    if (!token) {
        throw new Error('No token provided');
    }

    return verifyToken(token, jwtSecret);
}
