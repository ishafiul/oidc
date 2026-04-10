
// ============================================
// Public API
// ============================================

import {TRPCContext} from "../context";
import {SelectUser, users} from "../db/schema";
import {eq} from "drizzle-orm";
import {verify} from "hono/jwt";
import {DB} from "../db";
import {findAuthByUserId, isUserBanned} from "../../module/auth/repositories";


// ============================================
// User Validation
// ============================================

/**
 * Validate that a user exists, is not banned, and has an active session
 * Returns the full user object from the database
 */
export async function validateUser(
    ctx: TRPCContext,
    userId: string
): Promise<SelectUser> {
    const { c } = ctx;
    const db = c.get('db');

    const [foundUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!foundUser) {
        throw new Error('User not found');
    }

    const banned = await isUserBanned(db, userId);
    if (banned) {
        throw new Error('User account is banned');
    }

    const authSession = await findAuthByUserId(db, userId);
    if (!authSession) {
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
): Promise<{ userId: string; email: string }> {
    const verified = await verify(token, jwtSecret, 'HS256');
    return verified as { userId: string; email: string };
}

/**
 * Extract and verify token from Authorization header
 */
export async function extractAndVerifyToken(
    authHeader: string | null | undefined,
    jwtSecret: string
): Promise<{ userId: string; email: string }> {
    if (!authHeader) {
        throw new Error('No authorization header');
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    if (!token) {
        throw new Error('No token provided');
    }

    return verifyToken(token, jwtSecret);
}

