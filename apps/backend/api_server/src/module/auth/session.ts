import { ORPCError } from '@orpc/server';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { HonoContext } from '../../core/context';
import { parseAdminAllowedOrigins } from '../../core/browser-cors';

const DEFAULT_SESSION_COOKIE_NAME = 'oidc_admin_session';
const DEFAULT_CSRF_COOKIE_NAME = 'oidc_admin_csrf';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getAdminSessionCookieName(c: HonoContext): string {
	return c.env.ADMIN_SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE_NAME;
}

export function getAdminCsrfCookieName(c: HonoContext): string {
	return c.env.ADMIN_CSRF_COOKIE_NAME?.trim() || DEFAULT_CSRF_COOKIE_NAME;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	return fallback;
}

function parseCookieHeaderAllValues(
	cookieHeader: string | null | undefined,
	name: string,
): string[] {
	if (!cookieHeader) return [];
	const values: string[] = [];
	for (const part of cookieHeader.split(';')) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const cookieName = trimmed.slice(0, eq).trim();
		if (cookieName !== name) continue;
		let v = trimmed.slice(eq + 1).trim();
		if (v.startsWith('"') && v.endsWith('"')) {
			v = v.slice(1, -1);
		}
		if (!v) continue;
		if (v.includes('%')) {
			try {
				v = decodeURIComponent(v);
			} catch {
				// keep v
			}
		}
		values.push(v);
	}
	return values;
}

export function getAuthTokenFromRequest(c: HonoContext): string | null {
	const authHeader = c.req.header('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		return authHeader.slice(7).trim();
	}

	const raw = c.req.header('Cookie');
	const sessionName = getAdminSessionCookieName(c);
	const sessions = parseCookieHeaderAllValues(raw, sessionName);
	const last = sessions[sessions.length - 1];
	return last?.trim() || null;
}

function cookieOptions(c: HonoContext) {
	const secure = parseBoolean(c.env.ADMIN_COOKIE_SECURE, true);
	const domain = c.env.ADMIN_COOKIE_DOMAIN?.trim() || undefined;
	const sameSite: 'Lax' | 'None' =
		domain !== undefined && domain.length > 0 ? 'Lax' : secure ? 'None' : 'Lax';
	return {
		httpOnly: true,
		secure,
		sameSite,
		path: '/',
		maxAge: 60 * 60 * 24 * 14,
		domain,
	};
}

export function setAdminAuthCookies(c: HonoContext, token: string): string {
	const csrfToken = crypto.randomUUID();
	const sessionCookie = getAdminSessionCookieName(c);
	const csrfCookie = getAdminCsrfCookieName(c);

	setCookie(c, sessionCookie, token, cookieOptions(c));
	setCookie(c, csrfCookie, csrfToken, {
		...cookieOptions(c),
		httpOnly: false,
	});

	return csrfToken;
}

export function clearAdminAuthCookies(c: HonoContext): void {
	deleteCookie(c, getAdminSessionCookieName(c), {
		path: '/',
		domain: c.env.ADMIN_COOKIE_DOMAIN?.trim() || undefined,
	});
	deleteCookie(c, getAdminCsrfCookieName(c), {
		path: '/',
		domain: c.env.ADMIN_COOKIE_DOMAIN?.trim() || undefined,
	});
}

export function enforceWriteRequestProtection(c: HonoContext): void {
	if (!WRITE_METHODS.has(c.req.method.toUpperCase())) {
		return;
	}

	const sessionName = getAdminSessionCookieName(c);
	const sessionValues = parseCookieHeaderAllValues(c.req.header('Cookie'), sessionName);
	if (sessionValues.length === 0) {
		return;
	}

	const allowedOrigins = parseAdminAllowedOrigins(c.env.ADMIN_ALLOWED_ORIGINS);
	if (allowedOrigins.length > 0) {
		const origin = c.req.header('origin');
		if (!origin || !allowedOrigins.includes(origin)) {
			throw new ORPCError('FORBIDDEN', {
				message: 'Origin is not allowed for write operations',
			});
		}
		return;
	}

	const csrfName = getAdminCsrfCookieName(c);
	const csrfValues = parseCookieHeaderAllValues(c.req.header('Cookie'), csrfName).map((v) =>
		v.trim(),
	);
	const csrfHeader = c.req.header('x-csrf-token')?.trim() ?? '';

	if (
		csrfValues.length === 0 ||
		!csrfHeader ||
		!csrfValues.some((v) => v === csrfHeader)
	) {
		throw new ORPCError('FORBIDDEN', {
			message: 'CSRF validation failed',
		});
	}
}
