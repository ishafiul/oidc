export function normalizeRedirectUri(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return trimmed;
	}
	let u: URL;
	try {
		u = new URL(trimmed);
	} catch {
		return trimmed;
	}
	u.hash = '';
	const protocol = u.protocol;
	if (protocol === 'http:' || protocol === 'https:') {
		return `${u.origin}${u.pathname}${u.search}`;
	}
	const scheme = protocol.slice(0, -1);
	const host = u.hostname;
	const path = u.pathname;
	if (host && (!path || path === '/')) {
		return `${scheme}:/${host}${u.search}`;
	}
	const pathPart = path.startsWith('/') ? path : `/${path}`;
	return `${scheme}:${pathPart}${u.search}`;
}
