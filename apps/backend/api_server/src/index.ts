import {Hono} from "hono";
import {createTRPCContextFromHono, HonoContext, HonoTypes} from "./core/context";
import {mergeBrowserCorsIntoResponse, setBrowserCorsHeaders} from "./core/browser-cors";
import {openAPIHandler, rpcHandler} from "./core/handlers";
import docsRouter from "./core/docs.route";
import { getDb } from "./core/db";
import { oidcHttpRoutes } from "./module/oidc/http";
import { enforceWriteRequestProtection } from "./module/auth/session";

function isApiOrRpcPath(path: string): boolean {
	return path.startsWith("/api") || path.startsWith("/rpc");
}

const app = new Hono<HonoTypes>();

app.onError((err, c) => {
	if (isApiOrRpcPath(c.req.path)) {
		setBrowserCorsHeaders(c);
	}
	console.error(err);
	return c.json(
		{
			error: "internal_error",
			error_description: err instanceof Error ? err.message : "Server error",
		},
		500,
	);
});

app.notFound((c) => {
	if (isApiOrRpcPath(c.req.path)) {
		setBrowserCorsHeaders(c);
	}
	return c.json({ error: "not_found" }, 404);
});

app.use('*', async (c, next) => {
    c.set('db', getDb(c.env));
    await next();
});

const apiRpcMiddleware = async (c: HonoContext, next: () => Promise<void>) => {
    setBrowserCorsHeaders(c);
    if (c.req.method === "OPTIONS") {
        return c.body(null, 204);
    }

    try {
        enforceWriteRequestProtection(c);
    } catch (error) {
        return c.json(
            {
                error: "forbidden",
                error_description: error instanceof Error ? error.message : "Request rejected",
            },
            403,
        );
    }

    await next();
};

app.use("/api/*", apiRpcMiddleware);
app.use("/rpc/*", apiRpcMiddleware);

app.use("/api/*", async (c, next) => {
    const context = createTRPCContextFromHono(c);

    const {matched, response} = await openAPIHandler.handle(c.req.raw, {
        prefix: "/api",
        context,
    });

    if (matched) {
        return mergeBrowserCorsIntoResponse(c, response);
    }

    await next();
});

app.use("/rpc/*", async (c, next) => {
    const context = createTRPCContextFromHono(c);

    const {matched, response} = await rpcHandler.handle(c.req.raw, {
        prefix: "/rpc",
        context,
    });

    if (matched) {
        return mergeBrowserCorsIntoResponse(c, response);
    }

    await next();
});

app.route('/', oidcHttpRoutes);
app.route("/", docsRouter);

export default app;
