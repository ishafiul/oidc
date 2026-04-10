import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Plus } from 'lucide-react';
import { createProject } from '@/lib/api';
import { useProjectsQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';

type ProjectListItem = {
	readonly id: string;
	readonly name: string;
	readonly slug: string;
};

export function ProjectsPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const [name, setName] = useState('');
	const [slug, setSlug] = useState('');
	const [description, setDescription] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const projectsQuery = useProjectsQuery();
	const projects = projectsQuery.data ?? [];

	const createProjectMutation = useMutation({
		mutationFn: async () =>
			createProject(apiBaseUrl, {
				name,
				slug: slug || undefined,
				description: description || undefined,
			}),
		onSuccess: async () => {
			setName('');
			setSlug('');
			setDescription('');
			setErrorMessage(null);
			await queryClient.invalidateQueries({ queryKey: ['projects'] });
		},
		onError: (error) => {
			setErrorMessage(error instanceof Error ? error.message : 'Failed to create project');
		},
	});

	return (
		<div className="space-y-10">
			<header className="space-y-2">
				<p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary/90">Directory</p>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Projects</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">
					Each project is an isolated OIDC realm: own clients, scope sets, members, and permission graph.
				</p>
			</header>

			<div className="grid gap-8 lg:grid-cols-[1.25fr_minmax(280px,1fr)]">
				<section className="space-y-4">
					<h2 className="font-display text-lg font-semibold">Your workspaces</h2>
					{projectsQuery.isLoading ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : projects.length === 0 ? (
						<Card className="border-dashed border-border/80 bg-muted/15">
							<CardContent className="p-8 text-center">
								<p className="text-sm text-muted-foreground">No projects yet — create one on the right.</p>
							</CardContent>
						</Card>
					) : (
						<ul className="grid gap-3 sm:grid-cols-2">
							{projects.map((project: ProjectListItem, index: number) => (
								<li
									key={project.id}
									className={cn(
										'animate-rise-in group rounded-2xl border border-border/70 bg-card/60 p-0.5 shadow-sm transition-all',
										'hover:border-primary/35 hover:shadow-md hover:shadow-primary/5',
									)}
									style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}
								>
									<div className="flex h-full flex-col rounded-[0.9rem] bg-gradient-to-br from-card via-card to-secondary/20 p-4">
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<h3 className="truncate font-display text-lg font-semibold leading-tight">{project.name}</h3>
												<p className="mt-1 font-mono text-xs text-muted-foreground">/{project.slug}</p>
											</div>
											<Button
												size="sm"
												className="shrink-0 gap-1 shadow-sm"
												onClick={() => {
													setSelectedProjectSlug(project.slug);
													void navigate({ to: `/projects/${project.slug}/clients` });
												}}
											>
												Open
												<ArrowUpRight className="size-3.5 opacity-90" strokeWidth={2} />
											</Button>
										</div>
										<div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-3">
											<Link
												to="/projects/$slug/clients"
												params={{ slug: project.slug }}
												className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
												onClick={() => setSelectedProjectSlug(project.slug)}
											>
												Clients
											</Link>
											<span className="text-muted-foreground/40">·</span>
											<Link
												to="/projects/$slug/members"
												params={{ slug: project.slug }}
												className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
												onClick={() => setSelectedProjectSlug(project.slug)}
											>
												Members
											</Link>
											<span className="text-muted-foreground/40">·</span>
											<Link
												to="/projects/$slug/protocol"
												params={{ slug: project.slug }}
												className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
												onClick={() => setSelectedProjectSlug(project.slug)}
											>
												Protocol
											</Link>
											<span className="text-muted-foreground/40">·</span>
											<Link
												to="/projects/$slug/integration"
												params={{ slug: project.slug }}
												className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
												onClick={() => setSelectedProjectSlug(project.slug)}
											>
												Integration
											</Link>
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				<Card className="h-fit border-border/70 shadow-panel lg:sticky lg:top-24">
					<CardHeader className="space-y-1">
						<div className="flex items-center gap-2 text-primary">
							<Plus className="size-5" strokeWidth={1.75} />
							<CardTitle className="font-display text-xl">New project</CardTitle>
						</div>
						<CardDescription>Creates the project, your owner membership, and a default scope set.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="project-name">Name</Label>
							<Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="project-slug">Slug (optional)</Label>
							<Input id="project-slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="project-description">Description</Label>
							<Input
								id="project-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</div>
						<Button
							className="mt-2 w-full"
							disabled={createProjectMutation.isPending || !name}
							onClick={() => createProjectMutation.mutate()}
						>
							Create project
						</Button>
						{errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
