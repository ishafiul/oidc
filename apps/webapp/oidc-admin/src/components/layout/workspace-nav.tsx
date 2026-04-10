import {
	ClipboardList,
	FolderKanban,
	KeyRound,
	LayoutDashboard,
	Layers,
	Network,
	Plug,
	Shield,
	Users,
	UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type OverviewNavItem = {
	readonly to: string;
	readonly label: string;
	readonly hint: string;
	readonly Icon: LucideIcon;
};

export const overviewNavItems: OverviewNavItem[] = [
	{
		to: '/dashboard',
		label: 'Dashboard',
		hint: 'Overview & shortcuts',
		Icon: LayoutDashboard,
	},
	{
		to: '/users',
		label: 'Users',
		hint: 'Accounts & bans',
		Icon: Users,
	},
	{
		to: '/projects',
		label: 'All projects',
		hint: 'Create & pick a workspace',
		Icon: FolderKanban,
	},
];

export type ProjectNavItem = {
	readonly to: string;
	readonly label: string;
	readonly hint: string;
	readonly Icon: LucideIcon;
};

export function projectNavItems(slug: string): ProjectNavItem[] {
	const base = `/projects/${slug}`;
	return [
		{ to: `${base}/clients`, label: 'Clients', hint: 'OAuth apps & URIs', Icon: KeyRound },
		{ to: `${base}/scope-sets`, label: 'Scope sets', hint: 'Grouped OIDC scopes', Icon: Layers },
		{ to: `${base}/permissions`, label: 'Permissions', hint: 'FGAC & relations', Icon: Shield },
		{ to: `${base}/access`, label: 'Access overview', hint: 'Members × grants × scopes', Icon: ClipboardList },
		{ to: `${base}/members`, label: 'Members', hint: 'Roles & invites', Icon: UsersRound },
		{ to: `${base}/protocol`, label: 'Protocol', hint: 'Discovery & JWKS', Icon: Network },
		{ to: `${base}/integration`, label: 'Integration', hint: 'Project API keys & export', Icon: Plug },
	];
}

export function projectSlugFromPath(pathname: string): string | null {
	const match = /^\/projects\/([^/]+)\//.exec(pathname);
	return match?.[1] ?? null;
}

export function breadcrumbFromPath(pathname: string): { label: string; to?: string }[] {
	if (pathname === '/dashboard') return [{ label: 'Dashboard' }];
	if (pathname === '/users') return [{ label: 'Users' }];
	if (pathname === '/projects') return [{ label: 'Projects' }];

	const parts = pathname.split('/').filter(Boolean);
	if (parts[0] === 'projects' && parts.length >= 2) {
		const slug = parts[1];
		const tail = parts[2];
		const sectionLabels: Record<string, string> = {
			clients: 'Clients',
			'scope-sets': 'Scope sets',
			permissions: 'Permissions',
			access: 'Access overview',
			members: 'Members',
			protocol: 'Protocol',
			integration: 'Integration',
		};
		const crumbs: { label: string; to?: string }[] = [
			{ label: 'Projects', to: '/projects' },
			{ label: slug, to: `/projects/${slug}/clients` },
		];
		if (tail && sectionLabels[tail]) {
			crumbs.push({ label: sectionLabels[tail] });
		}
		return crumbs;
	}
	return [{ label: pathname }];
}
