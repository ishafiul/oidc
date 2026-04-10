/**
 * Protected Procedure
 *
 * Simplified protected procedure setup with automatic user and permissions in context.
 * 
 * @example
 * ```typescript
 * protectedProcedure({ anyOf: ['read'], resourceType: 'user' })
 *   .route({ method: 'GET', path: '/users' })
 *   .handler(async ({ context }) => {
 *     const ctx = getTRPCContext(context);
 *     const user = getUserFromContext(ctx); // Full user object, type-safe!
 *     const relations = getUserRelationsFromContext(ctx); // All relations
 *     // ...
 *   })
 * ```
 */

import { os, ORPCError } from '@orpc/server';
import { FGAC_CONFIG } from './module/fgac/config/fgac.config';
import type { ProcedurePermissions } from './module/fgac/procedure-types';
import { createPermissionService } from './module/fgac/services/permission-service.factory';
import { checkPermissions, extractResourceInfo } from './module/fgac/utils/auth.helpers';
import { enrichContextWithAuthUser, getTRPCContext } from "./core/context";
import { extractAndVerifyToken, validateUser } from "./core/utils/auth";
import { getAuthTokenFromRequest } from './module/auth/session';

// ============================================
// Types
// ============================================

/** Configuration type alias for convenience */
type Config = typeof FGAC_CONFIG;

export const publicProcedure = os

// ============================================
// Base Protected Procedure
// ============================================

/**
 * Create the base protected procedure middleware
 * Handles authentication and permission checking
 */
function createBaseProtectedProcedure(permissions: ProcedurePermissions<Config>) {
  return os.use(async ({ context, next }) => {
    const trpcCtx = getTRPCContext(context);
    const { c } = trpcCtx;

    // Extract request helpers
    const req = {
      raw: c.req.raw,
      header: (name: string) => c.req.header(name),
    };

    // Get and validate token
    const token = getAuthTokenFromRequest(c);

    if (!token) {
      throw new ORPCError('UNAUTHORIZED', {
        message: 'No token provided',
      });
    }

    const jwtSecret = trpcCtx.env.JWT_SECRET ?? '';

    // Verify token
    let payload: { userId: string; email: string };
    try {
      payload = await extractAndVerifyToken(token, jwtSecret);
    } catch {
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Invalid or expired token',
      });
    }

    // Validate user exists and is active
    const user = await validateUser(trpcCtx, payload.userId);

    // Set user in context
    c.set('user', user);


    // Create permission checker and store in context
    const permissionChecker = createPermissionService(trpcCtx.env, FGAC_CONFIG);

    // Extract resource info for permission check
    const resource = extractResourceInfo(permissions, req.raw, FGAC_CONFIG);

    // Check permissions
    let hasPermission: boolean;
    try {
      hasPermission = await checkPermissions({
        permissions,
        userId: payload.userId,
        resource,
        permissionChecker,
      });
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    if (!hasPermission) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Insufficient permissions',
      });
    }

    return next();
  });
}


/**
 * Protected procedure with automatic user and permissions in context
 * Automatically adds full user object, relations, and permissions to context
 *
 * @param permissions - The permission requirements for this procedure
 * @returns An ORPC procedure builder with authentication and permission checking
 *
 * @example
 * ```typescript
 * // Require 'read' permission on 'user' resource
 * protectedProcedure({ anyOf: ['read'], resourceType: 'user' })
 *
 * // Require specific relation
 * protectedProcedure({ relation: 'admin', resourceType: 'user' })
 *
 * // Require all of multiple permissions
 * protectedProcedure({ allOf: ['read', 'write'], resourceType: 'document' })
 *
 * // Extract resource ID from request
 * protectedProcedure({
 *   anyOf: ['read'],
 *   resourceType: 'user',
 *   resourceId: (req) => new URL(req.url).searchParams.get('id') ?? 'global'
 * })
 * ```
 */
export function protectedProcedure(permissions: ProcedurePermissions<Config>) {
  const baseProcedure = createBaseProtectedProcedure(permissions);
  return baseProcedure.use(enrichContextWithAuthUser());
}

export type { ProcedurePermissions } from './module/fgac/procedure-types';
