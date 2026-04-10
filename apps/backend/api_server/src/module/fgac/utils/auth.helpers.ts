/**
 * Authentication Helpers
 *
 * Shared utilities for token extraction, resource extraction, and permission checking.
 * These are the core building blocks for protected procedures.
 */

import { ORPCError } from '@orpc/server';
import type {
    FGACConfig,
    IPermissionChecker,
    InferDocType,
    Resource,
    Subject,
} from '../adapters/IPermissionAdapter';
import type { ProcedurePermissions } from '../procedure-types';

// ============================================
// Token Extraction
// ============================================

/**
 * Extract Bearer token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The token string or null if not found/invalid format
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
    if (!authHeader) {
        return null;
    }

    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return null;
}

// ============================================
// Resource Extraction
// ============================================

/**
 * Extract resource information from request based on permission configuration
 * @param permissions - The procedure permission specification
 * @param req - The raw Request object
 * @param config - The FGAC configuration
 * @returns A Resource object with type and id
 */
export function extractResourceInfo<TConfig extends FGACConfig>(
    permissions: ProcedurePermissions<TConfig>,
    req: Request,
    config: TConfig
): Resource<InferDocType<TConfig>> {
    // Extract resource type
    const extractedType =
        typeof permissions.resourceType === 'function'
            ? permissions.resourceType(req)
            : permissions.resourceType;

    if (!extractedType || !(config.docTypes as readonly string[]).includes(extractedType)) {
        throw new ORPCError('BAD_REQUEST', {
            message: `Invalid or missing resourceType. Expected one of: ${config.docTypes.join(', ')}`,
        });
    }

    // Extract resource ID (default to 'global' if not provided)
    let resourceId = 'global';
    if (permissions.resourceId !== undefined) {
        const extractedId =
            typeof permissions.resourceId === 'function'
                ? permissions.resourceId(req)
                : permissions.resourceId;
        if (extractedId) {
            resourceId = extractedId;
        }
    }

    return { type: extractedType, id: resourceId };
}

/**
 * Create a user subject for permission checking
 * @param userId - The user ID
 */
export function userSubject(userId: string): Subject {
    return `user:${userId}` as Subject;
}

// ============================================
// Permission Checking
// ============================================

/**
 * Options for checking permissions
 */
export interface PermissionCheckOptions<TConfig extends FGACConfig> {
    /** The permission specification to check against */
    permissions: ProcedurePermissions<TConfig>;
    /** The user ID to check permissions for */
    userId: string;
    /** The resource to check permissions on */
    resource: Resource<InferDocType<TConfig>>;
    /** The permission checker service */
    permissionChecker: IPermissionChecker<TConfig>;
}

/**
 * Check permissions based on ProcedurePermissions specification
 * Handles all permission check types: relation, anyOf, allOf, anyRelation, allRelations
 *
 * @param options - The permission check options
 * @returns Promise resolving to true if permitted, false otherwise
 */
export async function checkPermissions<TConfig extends FGACConfig>(
    options: PermissionCheckOptions<TConfig>
): Promise<boolean> {
    const { permissions, userId, resource, permissionChecker } = options;

    if (permissions.relation) {
        // Single relation check
        return permissionChecker.has(userId, permissions.relation, resource);
    }

    if (permissions.anyRelation) {
        // Any of multiple relations
        const checks = permissions.anyRelation.map((relation) =>
            permissionChecker.has(userId, relation, resource)
        );
        const results = await Promise.all(checks);
        return results.some((allowed) => allowed);
    }

    if (permissions.allRelations) {
        // All of multiple relations
        const checks = permissions.allRelations.map((relation) =>
            permissionChecker.has(userId, relation, resource)
        );
        const results = await Promise.all(checks);
        return results.every((allowed) => allowed);
    }

    if (permissions.anyOf) {
        // Any of multiple permissions
        return permissionChecker.canAny(userId, permissions.anyOf, resource);
    }

    if (permissions.allOf) {
        // All of multiple permissions
        const result = await permissionChecker.canAll(userId, permissions.allOf, resource);
        return result.allAllowed;
    }

    return false;
}

// ============================================
// Error Helpers
// ============================================

/**
 * Create an UNAUTHORIZED error for missing/invalid tokens
 */
export function createUnauthorizedError(message = 'No token provided') {
    return new ORPCError('UNAUTHORIZED', { message });
}

/**
 * Create a FORBIDDEN error for permission failures
 */
export function createForbiddenError(message = 'Insufficient permissions') {
    return new ORPCError('FORBIDDEN', { message });
}

/**
 * Create an INTERNAL_SERVER_ERROR for permission check failures
 */
export function createPermissionCheckError(error: unknown) {
    return new ORPCError('INTERNAL_SERVER_ERROR', {
        message: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
    });
}

