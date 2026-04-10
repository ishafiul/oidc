import { os } from "@orpc/server";
import { permissionRoutes } from "./module/permissions/route";
import { authRoutes } from "./module/auth/route";
import { projectRoutes } from "./module/projects/route";
import { adminRoutes } from "./module/admin/route";

// Use ORPC's router builder for proper type inference on the client
export const appRouter = os.router({
    authRoutes,
    adminRoutes,
    permissionRoutes,
    projectRoutes,
});

export type AppRouter = typeof appRouter;
