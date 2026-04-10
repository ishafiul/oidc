import {Context} from 'hono';
import {os} from '@orpc/server';
import {DB} from "../db";
import {SelectUser} from "../db/schema";

import type { GetUserRelationsResponse, InferDocType } from '../../module/fgac/adapters/IPermissionAdapter';
import { FGAC_CONFIG } from '../../module/fgac/config/fgac.config';
import {
    createPermissionManagementService,
    type PermissionServiceEnv,
} from '../../module/fgac/services/permission-service.factory';


export type Env = PermissionServiceEnv<typeof FGAC_CONFIG> & {
    ENVIRONMENT: string;
    POSTGRES_CONNECTION_STRING: string;
    RESEND_API_KEY: string;
    TEST_EMAIL: string;
    TEST_OTP: string;
    JWT_SECRET: string;
    OIDC_ISSUER?: string;
    OIDC_HOSTED_LOGIN_URL?: string;
    OIDC_DEFAULT_PROJECT_SLUG?: string;
    OIDC_CODE_TTL_SECONDS?: string;
    OIDC_ACCESS_TOKEN_TTL_SECONDS?: string;
    OIDC_REFRESH_TOKEN_TTL_SECONDS?: string;
    OIDC_ADMIN_API_KEY?: string;
    ADMIN_ALLOWED_ORIGINS?: string;
    ADMIN_SESSION_COOKIE_NAME?: string;
    ADMIN_CSRF_COOKIE_NAME?: string;
    ADMIN_COOKIE_SECURE?: string;
    ADMIN_COOKIE_DOMAIN?: string;
    ADMIN_INVITE_BASE_URL?: string;
    ADMIN_INVITE_FROM_EMAIL?: string;
    DOCS_USERNAME?: string;
    DOCS_PASSWORD?: string;
};

export type HonoTypes = {
    Bindings: Env;
    Variables: {
        db: DB;
        language: string;
        authUserRoles?: string[];
        authIsAdmin?: boolean;
        authIsSuperAdmin?: boolean;
        user?: SelectUser;
        userRelations?: Array<{ relation: string; id: string; type: string }>;
        userPermissions?: string[];
    };
};

export type HonoContext = Context<HonoTypes>;

export type TRPCContext = {
    env: Env;
    get: HonoContext['get'];
    set: HonoContext['set'];
    executionCtx: HonoContext['executionCtx'];
    c: HonoContext;
};

export type ProtectedContext = TRPCContext & {
    c: HonoContext & {
        Variables: HonoTypes['Variables'] & {
            user: SelectUser;
            userRelations: Array<{ relation: string; id: string; type: string }>;
            userPermissions: string[];
        };
    };
};


/**
 * Create TRPCContext from HonoContext
 */
export function createTRPCContextFromHono(c: HonoContext): TRPCContext {
    return {env: c.env, get: c.get, set: c.set, executionCtx: c.executionCtx, c};
}

/**
 * Type guard to check if context is TRPCContext
 */
function isTRPCContext(context: unknown): context is TRPCContext {
    return (
        typeof context === 'object' &&
        context !== null &&
        'c' in context &&
        'get' in context &&
        'set' in context &&
        'env' in context &&
        'executionCtx' in context
    );
}

/**
 * Get TRPCContext from unknown context or return TRPCContext directly
 * Fully type-safe with proper type inference
 *
 * @example
 * ```typescript
 * // From unknown (ORPC middleware)
 * const ctx = getTRPCContext(context);
 *
 * // From TRPCContext (already typed)
 * const ctx = getTRPCContext(trpcContext);
 * ```
 */
export function getTRPCContext(context: TRPCContext): TRPCContext;
export function getTRPCContext(context: unknown): TRPCContext;
export function getTRPCContext(context: unknown | TRPCContext): TRPCContext {
    if (isTRPCContext(context)) {
        return context;
    }
    throw new Error('Invalid context: expected TRPCContext');
}

/**
 * User relation info for context
 */
export interface UserRelation {
    relation: string;
    id: string;
    type: string;
}

// ============================================
// Context Enrichment
// ============================================

/**
 * Setup function that enriches context with user relations and permissions
 * Call this after the base protected procedure to add relations and permissions to context
 *
 * @example
 * ```typescript
 * const protectedProcedure = baseProtectedProcedure(permissions)
 *   .use(enrichContextWithAuthUser());
 * ```
 */
export function enrichContextWithAuthUser() {
    return async (options: Parameters<Parameters<typeof os.use>[0]>[0]) => {
        const { context, next } = options;
        const trpcCtx = getTRPCContext(context);
        const c = trpcCtx.c;

        const user = c.get('user') as SelectUser | undefined;
        if (!user || !user.id) {
            return next();
        }

        const userId = user.id;

        const permissionManagementService = createPermissionManagementService(
            trpcCtx.env,
            FGAC_CONFIG
        );
        const userRelationsResult = await permissionManagementService.getUserRelations(
            userId,
            'user' as InferDocType<typeof FGAC_CONFIG>
        );

        const userRelations: UserRelation[] = userRelationsResult.relations.map((r: GetUserRelationsResponse<InferDocType<typeof FGAC_CONFIG>>['relations'][number]) => ({
            relation: r.relation,
            id: r.id,
            type: r.type,
        }));

        c.set('userRelations', userRelations);

        const relationNames = userRelations.map((r) => r.relation);
        const userPermissions: string[] = [...relationNames];

        if (relationNames.includes('admin')) {
            userPermissions.push('admin', 'superadmin');
        } else if (relationNames.some((r) => r.includes('admin'))) {
            userPermissions.push('admin');
        }

        c.set('userPermissions', userPermissions);

        c.set('authUserRoles', relationNames);
        c.set('authIsAdmin', authIsAdmin(relationNames));
        c.set('authIsSuperAdmin', authIsSuperAdmin(relationNames));

        return next();
    };
}

function authIsAdmin(relationNames: string[]): boolean {
    return relationNames.some((r) => r.includes('admin') || r === 'admin');
}

function authIsSuperAdmin(relationNames: string[]): boolean {
    return relationNames.includes('admin');
}
