import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, FolderKanban, KeyRound, Sparkles, Users } from 'lucide-react';
import { useProjectsQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';

export function DashboardPage() {
	const navigate = useNavigate();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const sessionUser = useAdminStore((state) => state.sessionUser);
	const persistedSlug = useAdminStore((state) => state.selectedProjectSlug);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const projectsQuery = useProjectsQuery();
	const projects = projectsQuery.data ?? [];
	const continueProject = projects.find((p) => p.slug === persistedSlug) ?? projects[0];

	return (
		<div className="space-y-10">
			<header className="space-y-3">
				<p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary/90">Today</p>
				<h1 className="font-display text-3xl font-semibold tracking-tight md:text-[2.15rem] md:leading-tight">
					{sessionUser?.name ? `Welcome back, ${sessionUser.name}` : 'Welcome back'}
				</h1>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					Pick a project to configure OIDC clients, scopes, and access. Global user accounts stay under Users.
				</p>
			</header>

			<section className="grid gap-4 md:grid-cols-3">
				<Card
					className={cn(
						'overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/25 shadow-sm transition-shadow hover:shadow-md',
					)}
				>
					<CardContent className="animate-rise-in p-5">
						<FolderKanban className="size-9 text-primary" strokeWidth={1.25} />
						<h2 className="mt-4 font-display text-lg font-semibold">Projects</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Workspaces with their own issuer, clients, and FGAC graph.
						</p>
						<Button className="mt-5 gap-1.5" variant="secondary" size="sm" asChild>
							<Link to="/projects">
								Browse
								<ArrowRight className="size-3.5 opacity-80" />
							</Link>
						</Button>
					</CardContent>
				</Card>

				<Card
					className={cn(
						'overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/25 shadow-sm transition-shadow hover:shadow-md',
					)}
				>
					<CardContent className="animate-rise-in p-5 [animation-delay:70ms]">
						<Users className="size-9 text-primary" strokeWidth={1.25} />
						<h2 className="mt-4 font-display text-lg font-semibold">Users</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Identity store — rename, ban, or restore access globally.
						</p>
						<Button className="mt-5 gap-1.5" variant="secondary" size="sm" asChild>
							<Link to="/users">
								Open directory
								<ArrowRight className="size-3.5 opacity-80" />
							</Link>
						</Button>
					</CardContent>
				</Card>

				<Card
					className={cn(
						'overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/25 shadow-sm transition-shadow hover:shadow-md',
					)}
				>
					<CardContent className="animate-rise-in p-5 [animation-delay:140ms]">
						<KeyRound className="size-9 text-primary" strokeWidth={1.25} />
						<h2 className="font-display text-lg font-semibold">API base</h2>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							ORPC lives here; admin uses cookies and CSRF on writes.
						</p>
						<p className="mt-4 line-clamp-4 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
							{apiBaseUrl}
						</p>
					</CardContent>
				</Card>
			</section>

			<section className="space-y-4">
				<div className="flex items-center gap-2">
					<Sparkles className="size-4 text-accent-foreground" strokeWidth={1.75} />
					<h2 className="font-display text-lg font-semibold">Continue working</h2>
				</div>
				{projectsQuery.isLoading ? (
					<p className="text-sm text-muted-foreground">Loading projects…</p>
				) : projects.length === 0 ? (
					<Card className="border-dashed border-border/80 bg-muted/20">
						<CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="font-medium">No projects yet</p>
								<p className="mt-1 text-sm text-muted-foreground">Create one to get a default scope set and owner role.</p>
							</div>
							<Button asChild>
								<Link to="/projects">Create project</Link>
							</Button>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						{continueProject ? (
							<Card className="border-primary/25 bg-primary/[0.04]">
								<CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Suggested</p>
										<p className="mt-1 font-display text-xl font-semibold">{continueProject.name}</p>
										<p className="mt-1 font-mono text-xs text-muted-foreground">/{continueProject.slug}</p>
									</div>
									<Button
										className="shrink-0 gap-2"
										onClick={() => {
											setSelectedProjectSlug(continueProject.slug);
											void navigate({ to: `/projects/${continueProject.slug}/clients` });
										}}
									>
										Open workspace
										<ArrowRight className="size-4" />
									</Button>
								</CardContent>
							</Card>
						) : null}
						<Card className="border-border/60">
							<CardContent className="p-5">
								<p className="text-sm font-medium">All workspaces</p>
								<p className="mt-1 text-sm text-muted-foreground">Switch context anytime from the projects list.</p>
								<Button className="mt-4" variant="outline" size="sm" asChild>
									<Link to="/projects">View list</Link>
								</Button>
							</CardContent>
						</Card>
					</div>
				)}
			</section>
		</div>
	);
}
