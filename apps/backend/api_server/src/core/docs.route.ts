import {Hono, type Context} from "hono";
import {Scalar} from "@scalar/hono-api-reference";
import {HonoTypes} from "./context";
import {setBrowserCorsHeaders} from "./browser-cors";
import {generateOpenApiSpec} from "common-pack/openApi";
import {appRouter} from "../router";
import { logger } from "common-pack/logger";

const docsRouter = new Hono<HonoTypes>();

let cachedSpec: unknown = null;

docsRouter.use("*", async (c, next) => {
	setBrowserCorsHeaders(c);
	if (c.req.method === "OPTIONS") {
		return c.body(null, 204);
	}
	await next();
});

async function basicAuthMiddleware(c: Context<HonoTypes>, next: () => Promise<void>) {
    const username = c.env.DOCS_USERNAME;
    const password = c.env.DOCS_PASSWORD;

    if (!username || !password) {
        await next();
        return;
    }

    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
        c.status(401);
        return c.json({
            error: "Unauthorized",
            message: "Basic authentication required",
        });
    }

    const base64Credentials = authHeader.substring(6);
    const credentials = atob(base64Credentials);
    const [providedUsername, providedPassword] = credentials.split(":");

    if (providedUsername !== username || providedPassword !== password) {
        c.status(401);
        return c.json({
            error: "Unauthorized",
            message: "Invalid credentials",
        });
    }

    await next();
}

docsRouter.use("*", basicAuthMiddleware);

docsRouter.get("/spec.json", async (c) => {
    try {
        if (!cachedSpec) {
            cachedSpec = await generateOpenApiSpec({
                router: appRouter, info: {
                    title: "GG",
                    version: "1"
                }
            }).catch(reason => {
                logger.error(reason.message);
            })
        }
        return c.json(cachedSpec);
    } catch (error) {
        return c.json({error: "Failed to generate OpenAPI spec"}, 500);
    }
});

docsRouter.get(
    "/",
    async (c, next) => {
        try {
            const url = new URL(c.req.url);
            const specUrl = `${url.origin}/spec.json`;

            const scalarHandler = Scalar({
                url: specUrl,
                theme: "default",
                layout: "modern",
                withDefaultFonts: true,
            });

            return await scalarHandler(c as any, next);
        } catch (error) {
            return c.json({
                error: "Failed to render documentation",
                details: error instanceof Error ? error.message : String(error)
            }, 500);
        }
    }
);

export default docsRouter;

