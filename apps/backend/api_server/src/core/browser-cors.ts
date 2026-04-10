import type {Context} from "hono";
import type {HonoTypes} from "./context";

export type HonoContext = Context<HonoTypes>;

function normalizeAllowedOriginEntry(entry: string): string {
	try {
		return new URL(entry).origin;
	} catch {
		return entry;
	}
}

export function parseAdminAllowedOrigins(raw: string | undefined): string[] {
	if (!raw) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
		const origin = normalizeAllowedOriginEntry(item);
		if (!seen.has(origin)) {
			seen.add(origin);
			out.push(origin);
		}
	}
	return out;
}

function applyBrowserCorsToHeaders(c: HonoContext, target: Headers): void {
	const requestOrigin = c.req.header("origin");
	const allowedOrigins = parseAdminAllowedOrigins(c.env.ADMIN_ALLOWED_ORIGINS);

	target.set("Vary", "Origin");
	target.set(
		"Access-Control-Allow-Headers",
		"authorization, content-type, x-csrf-token",
	);
	target.set(
		"Access-Control-Allow-Methods",
		"GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
	);

	if (!requestOrigin) {
		target.set("Access-Control-Allow-Origin", "*");
		target.delete("Access-Control-Allow-Credentials");
		return;
	}

	if (allowedOrigins.length === 0) {
		target.set("Access-Control-Allow-Origin", requestOrigin);
		target.set("Access-Control-Allow-Credentials", "true");
		return;
	}

	if (allowedOrigins.includes(requestOrigin)) {
		target.set("Access-Control-Allow-Origin", requestOrigin);
		target.set("Access-Control-Allow-Credentials", "true");
		return;
	}

	target.delete("Access-Control-Allow-Origin");
	target.delete("Access-Control-Allow-Credentials");
}

const BROWSER_CORS_HEADER_NAMES = [
	"Access-Control-Allow-Origin",
	"Access-Control-Allow-Credentials",
	"Vary",
	"Access-Control-Allow-Headers",
	"Access-Control-Allow-Methods",
] as const;

export function setBrowserCorsHeaders(c: HonoContext): void {
	const h = new Headers();
	applyBrowserCorsToHeaders(c, h);
	for (const key of BROWSER_CORS_HEADER_NAMES) {
		if (h.has(key)) {
			c.header(key, h.get(key)!);
		} else {
			c.header(key, undefined);
		}
	}
}

export function mergeBrowserCorsIntoResponse(
	c: HonoContext,
	response: Response,
): Response {
	const headers = new Headers(response.headers);
	applyBrowserCorsToHeaders(c, headers);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
