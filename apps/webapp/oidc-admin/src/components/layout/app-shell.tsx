import { useEffect } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut } from 'lucide-react';
import { logoutAdmin } from '@/lib/api';
import { useProjectsQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';
import {
	breadcrumbFromPath,
	overviewNavItems,
	projectNavItems,
	projectSlugFromPath,
} from '@/components/layout/workspace-nav';

const navLinkClass =
	'group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border/80 hover:bg-secondary/50';
const navLinkActiveClass =
	'border-primary/35 bg-primary/[0.07] text-foreground shadow-sm shadow-primary/10';

export function AppShell() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const pathname = useRouterState({ select: (state) => state.location.pathname });

	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const sessionUser = useAdminStore((state) => state.sessionUser);
	const sessionLoaded = useAdminStore((state) => state.sessionLoaded);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);
	const clearSession = useAdminStore((state) => state.clearSession);

	const projectsQuery = useProjectsQuery();
	const urlProjectSlug = projectSlugFromPath(pathname);

	const logoutMutation = useMutation({
		mutationFn: async () => logoutAdmin(apiBaseUrl),
		onSuccess: async () => {
			clearSession();
			await queryClient.invalidateQueries();
			void navigate({ to: '/login' });
		},
	});

	useEffect(() => {
		if (urlProjectSlug) {
			setSelectedProjectSlug(urlProjectSlug);
		}
	}, [urlProjectSlug, setSelectedProjectSlug]);

	useEffect(() => {
		if (sessionLoaded && !sessionUser) {
			void navigate({ to: '/login' });
		}
	}, [navigate, sessionLoaded, sessionUser]);

	const activeProject = projectsQuery.data?.find((p) => p.slug === urlProjectSlug);
	const crumbs = breadcrumbFromPath(pathname);
	const projectLinks = urlProjectSlug ? projectNavItems(urlProjectSlug) : [];

	if (!sessionLoaded) {
		return (
			<div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted-foreground">
				<span className="animate-pulse">Loading session…</span>
			</div>
		);
	}

	return (
		<div className="min-h-screen text-foreground">
			<div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6 lg:px-6">
				<aside className="sticky top-6 hidden h-fit w-[272px] shrink-0 flex-col rounded-2xl border border-border/60 bg-card/90 p-4 shadow-panel backdrop-blur-sm md:flex">
					<div className="border-b border-border/50 pb-4">
						<p className="font-display text-xl font-semibold tracking-tight text-foreground">Control</p>
						<p className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
							OIDC workspace
						</p>
						<p className="mt-3 truncate font-mono text-xs text-muted-foreground" title={sessionUser?.email ?? ''}>
							{sessionUser?.email ?? '—'}
						</p>
					</div>

					<div className="mt-5 space-y-1">
						<p className="mb-2 px-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground/90">
							Overview
						</p>
						{overviewNavItems.map(({ to, label, hint, Icon }) => (
							<Link
								key={to}
								to={to}
								className={navLinkClass}
								activeProps={{ className: cn(navLinkClass, navLinkActiveClass) }}
								activeOptions={{ exact: true }}
							>
								<Icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
								<span>
									<span className="block text-sm font-medium leading-tight">{label}</span>
									<span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground group-hover:text-muted-foreground/90">
										{hint}
									</span>
								</span>
							</Link>
						))}
					</div>

					{urlProjectSlug ? (
						<div className="mt-6 border-t border-border/50 pt-5">
							<p className="mb-1 px-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground/90">
								Active project
							</p>
							<p className="mb-3 truncate px-1 font-display text-base font-semibold leading-snug" title={activeProject?.name}>
								{activeProject?.name ?? urlProjectSlug}
							</p>
							<p className="mb-2 px-1 font-mono text-[10px] text-muted-foreground/80">/{urlProjectSlug}</p>
							<nav className="space-y-0.5">
								{projectLinks.map(({ to, label, hint, Icon }) => (
									<Link
										key={to}
										to={to}
										className={navLinkClass}
										activeProps={{ className: cn(navLinkClass, navLinkActiveClass) }}
									>
										<Icon className="mt-0.5 size-4 shrink-0 text-accent-foreground" strokeWidth={1.75} />
										<span>
											<span className="block text-sm font-medium leading-tight">{label}</span>
											<span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{hint}</span>
										</span>
									</Link>
								))}
							</nav>
						</div>
					) : null}

					<div className="mt-6 border-t border-border/50 pt-4">
						<p className="mb-2 line-clamp-2 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
							{apiBaseUrl}
						</p>
						<Button
							className="w-full gap-2 font-medium"
							variant="outline"
							size="sm"
							onClick={() => logoutMutation.mutate()}
							disabled={logoutMutation.isPending}
						>
							<LogOut className="size-3.5" strokeWidth={2} />
							Logout
						</Button>
					</div>
				</aside>

				<div className="min-w-0 flex-1">
					<header className="mb-4 md:hidden">
						<p className="font-display text-lg font-semibold">Control</p>
						<nav className="mt-3 flex flex-wrap gap-2">
							{overviewNavItems.map(({ to, label }) => (
								<Link
									key={to}
									to={to}
									className="rounded-lg border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium"
								>
									{label}
								</Link>
							))}
							{projectLinks.map(({ to, label }) => (
								<Link key={to} to={to} className="rounded-lg border border-border/70 bg-card/80 px-3 py-1.5 text-xs">
									{label}
								</Link>
							))}
						</nav>
					</header>

					<nav
						className="mb-4 flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground"
						aria-label="Breadcrumb"
					>
						{crumbs.map((crumb, i) => (
							<span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
								{i > 0 ? <ChevronRight className="size-3 opacity-50" /> : null}
								{crumb.to ? (
									<Link to={crumb.to} className="hover:text-foreground">
										{crumb.label}
									</Link>
								) : (
									<span className="text-foreground">{crumb.label}</span>
								)}
							</span>
						))}
					</nav>

					<main
						key={pathname}
						className="animate-rise-in rounded-2xl border border-border/60 bg-card/85 p-5 shadow-panel md:p-8"
					>
						<Outlet />
					</main>
				</div>
			</div>
		</div>
	);
}
