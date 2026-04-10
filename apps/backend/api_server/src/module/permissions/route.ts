/**
 * Permission Routes
 *
 * Simplified setup for permission management routes.
 * Uses shared helpers for consistent configuration.
 */
import {protectedProcedure} from "../../procedure";
import { FGAC_CONFIG } from '../fgac/config/fgac.config';
import type { PermissionContext } from '../fgac/procedure-types';
import { createPermissionRoutes } from '../fgac/routes/permissions.route';
import type { PermissionServiceEnv } from '../fgac/services/permission-service.factory';
import {getTRPCContext, type TRPCContext} from "../../core/context";

function toPermissionContext(
    ctx: TRPCContext
): PermissionContext<typeof FGAC_CONFIG> & { env: PermissionServiceEnv<typeof FGAC_CONFIG> } {
    return {
        env: ctx.env,
        get: ctx.get,
        set: ctx.set,
        req: {
            raw: ctx.c.req.raw,
            header: (name: string) => ctx.c.req.header(name),
        },
    };
}

export const permissionRoutes = createPermissionRoutes({
    protectedProcedure,
    getContext: (context) => toPermissionContext(getTRPCContext(context)),
    config: FGAC_CONFIG,
});
