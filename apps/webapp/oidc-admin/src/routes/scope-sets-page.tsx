import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import {
	addScopeToSet,
	createScopeSet,
	deactivateScopeSet,
	removeScopeFromSet,
	updateScopeSet,
} from '@/lib/api';
import { useProjectScopeSetsQuery } from '@/hooks/use-oidc-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAdminStore } from '@/stores/admin-store';

type ScopeSetRow = {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly isDefault: boolean;
	readonly isActive: boolean;
	readonly scopes: string[];
};

function parseScopesInput(raw: string): string[] {
	return Array.from(new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)));
}

export function ScopeSetsPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/scope-sets' });
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const scopeSetsQuery = useProjectScopeSetsQuery(slug);
	const rows = (scopeSetsQuery.data ?? []) as ScopeSetRow[];

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [editDescription, setEditDescription] = useState('');
	const [newScope, setNewScope] = useState('');
	const [createName, setCreateName] = useState('');
	const [createDescription, setCreateDescription] = useState('');
	const [createScopes, setCreateScopes] = useState('openid profile email');
	const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

	const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	useEffect(() => {
		if (!selectedId && rows.length > 0) {
			setSelectedId(rows[0].id);
		}
		if (selectedId && !rows.some((r) => r.id === selectedId) && rows.length > 0) {
			setSelectedId(rows[0].id);
		}
	}, [rows, selectedId]);

	useEffect(() => {
		if (selected) {
			setEditName(selected.name);
			setEditDescription(selected.description ?? '');
		} else {
			setEditName('');
			setEditDescription('');
		}
	}, [selected]);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ['projects', slug, 'scope-sets'] });

	const updateMetaMutation = useMutation({
		mutationFn: async () => {
			if (!selectedId) throw new Error('No scope set selected');
			return updateScopeSet(apiBaseUrl, slug, selectedId, {
				name: editName.trim(),
				description: editDescription.trim() || null,
			});
		},
		onSuccess: async () => {
			setBanner({ type: 'ok', text: 'Scope set details saved.' });
			await invalidate();
		},
		onError: (e) => {
			setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
		},
	});

	const toggleActiveMutation = useMutation({
		mutationFn: async (next: boolean) => {
			if (!selectedId) throw new Error('No scope set selected');
			if (!next) {
				return deactivateScopeSet(apiBaseUrl, slug, selectedId);
			}
			return updateScopeSet(apiBaseUrl, slug, selectedId, { isActive: true });
		},
		onSuccess: async () => {
			setBanner({ type: 'ok', text: 'Status updated.' });
			await invalidate();
		},
		onError: (e) => {
			setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Update failed' });
		},
	});

	const addScopeMutation = useMutation({
		mutationFn: async () => {
			if (!selectedId) throw new Error('No scope set selected');
			const s = newScope.trim();
			if (!s) throw new Error('Enter a scope string');
			return addScopeToSet(apiBaseUrl, slug, selectedId, s);
		},
		onSuccess: async () => {
			setNewScope('');
			setBanner({ type: 'ok', text: 'Scope added.' });
			await invalidate();
		},
		onError: (e) => {
			setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Add failed' });
		},
	});

	const removeScopeMutation = useMutation({
		mutationFn: async (scope: string) => {
			if (!selectedId) throw new Error('No scope set selected');
			return removeScopeFromSet(apiBaseUrl, slug, selectedId, scope);
		},
		onSuccess: async () => {
			setBanner({ type: 'ok', text: 'Scope removed.' });
			await invalidate();
		},
		onError: (e) => {
			setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Remove failed' });
		},
	});

	const createMutation = useMutation({
		mutationFn: async () =>
			createScopeSet(apiBaseUrl, slug, {
				name: createName.trim(),
				description: createDescription.trim() || undefined,
				scopes: parseScopesInput(createScopes),
			}),
		onSuccess: async (created) => {
			setCreateName('');
			setCreateDescription('');
			setCreateScopes('openid profile email');
			setBanner({ type: 'ok', text: 'Scope set created.' });
			setSelectedId(created.id);
			await invalidate();
		},
		onError: (e) => {
			setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Create failed' });
		},
	});

	const busy =
		updateMetaMutation.isPending ||
		toggleActiveMutation.isPending ||
		addScopeMutation.isPending ||
		removeScopeMutation.isPending ||
		createMutation.isPending;

	return (
		<div className="space-y-8">
			<header className="access-ledger-hero relative overflow-hidden rounded-2xl border border-primary/15 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
				<div
					className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl"
					aria-hidden
				/>
				<div
					className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
					aria-hidden
				/>
				<p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">OIDC · Authorization</p>
				<h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
					Scope registry
				</h1>
				<p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
					Each string below becomes an allowed OAuth scope for clients linked to this set. The authorize endpoint
					only accepts scopes that appear here — create the set, then attach it to a client, then add or remove
					individual scope strings.
				</p>
				<p className="mt-2 font-mono text-xs text-muted-foreground">
					Project <span className="text-foreground">{slug}</span>
				</p>
			</header>

			{banner ? (
				<div
					className={`rounded-xl border px-4 py-3 text-sm font-medium ${
						banner.type === 'ok'
							? 'border-accent/40 bg-accent/10 text-accent-foreground'
							: 'border-destructive/40 bg-destructive/10 text-destructive'
					}`}
					role="status"
				>
					{banner.text}
				</div>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
				<Card className="border-primary/10 shadow-panel">
					<CardHeader className="pb-3">
						<CardTitle className="font-display text-xl">Sets in this project</CardTitle>
						<CardDescription>Select one to edit metadata and scope strings.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{scopeSetsQuery.isLoading ? (
							<p className="text-sm text-muted-foreground">Loading…</p>
						) : rows.length === 0 ? (
							<p className="text-sm text-muted-foreground">No scope sets yet. Create one on the right.</p>
						) : (
							<ul className="space-y-2">
								{rows.map((r, idx) => {
									const active = r.id === selectedId;
									return (
										<li key={r.id}>
											<button
												type="button"
												onClick={() => {
													setSelectedId(r.id);
													setBanner(null);
												}}
												className={`w-full rounded-xl border px-4 py-3 text-left transition-all animate-rise-in ${
													active
														? 'border-primary/50 bg-primary/8 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.12)]'
														: 'border-border/80 bg-card/60 hover:border-primary/25 hover:bg-card'
												}`}
												style={{ animationDelay: `${idx * 45}ms` }}
											>
												<div className="flex items-start justify-between gap-2">
													<span className="font-display text-base font-semibold text-foreground">{r.name}</span>
													<div className="flex shrink-0 flex-wrap justify-end gap-1">
														{r.isDefault ? (
															<Badge variant="secondary" className="font-mono text-[10px]">
																default
															</Badge>
														) : null}
														<Badge
															variant={r.isActive ? 'default' : 'outline'}
															className={`font-mono text-[10px] ${r.isActive ? '' : 'opacity-70'}`}
														>
															{r.isActive ? 'active' : 'inactive'}
														</Badge>
													</div>
												</div>
												<p className="mt-1 line-clamp-2 font-mono text-[11px] leading-snug text-muted-foreground">
													{r.scopes.length ? r.scopes.join(' · ') : '— no scopes —'}
												</p>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</Card>

				<div className="space-y-6">
					{selected ? (
						<Card className="border-primary/10 shadow-panel">
							<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-4">
								<div>
									<CardTitle className="font-display text-xl">Edit “{selected.name}”</CardTitle>
									<CardDescription>Name, description, and lifecycle. Scopes are managed below.</CardDescription>
								</div>
								<div className="flex flex-wrap gap-2">
									{selected.isActive ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={busy}
											className="font-mono text-xs"
											onClick={() => toggleActiveMutation.mutate(false)}
										>
											Deactivate
										</Button>
									) : (
										<Button
											type="button"
											size="sm"
											disabled={busy}
											className="font-mono text-xs"
											onClick={() => toggleActiveMutation.mutate(true)}
										>
											Activate
										</Button>
									)}
								</div>
							</CardHeader>
							<CardContent className="space-y-4 pt-6">
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-1.5 sm:col-span-2">
										<Label htmlFor="edit-name">Display name</Label>
										<Input
											id="edit-name"
											value={editName}
											onChange={(e) => setEditName(e.target.value)}
											className="font-body"
										/>
									</div>
									<div className="space-y-1.5 sm:col-span-2">
										<Label htmlFor="edit-desc">Description</Label>
										<Textarea
											id="edit-desc"
											value={editDescription}
											onChange={(e) => setEditDescription(e.target.value)}
											rows={3}
											className="resize-y font-body"
										/>
									</div>
								</div>
								<Button
									type="button"
									disabled={busy || !editName.trim()}
									onClick={() => updateMetaMutation.mutate()}
									className="font-semibold"
								>
									Save details
								</Button>

								<div className="border-t border-border/70 pt-6">
									<h3 className="font-display text-lg font-semibold text-foreground">OAuth scope strings</h3>
									<p className="mt-1 text-sm text-muted-foreground">
										These values must match what clients request (e.g. <code className="font-mono text-xs">demo:data:read</code>
										). Add or remove rows; there is no rename — remove the old string and add the new one.
									</p>
									<ul className="mt-4 flex flex-wrap gap-2">
										{selected.scopes.map((scope) => (
											<li
												key={scope}
												className="group flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 font-mono text-xs text-foreground shadow-sm"
											>
												<span>{scope}</span>
												<button
													type="button"
													className="ml-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
													disabled={busy}
													title={`Remove ${scope}`}
													onClick={() => removeScopeMutation.mutate(scope)}
												>
													×
												</button>
											</li>
										))}
									</ul>
									{selected.scopes.length === 0 ? (
										<p className="mt-2 text-sm text-destructive/90">No scopes — clients will fall back to defaults only.</p>
									) : null}
									<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
										<div className="min-w-0 flex-1 space-y-1.5">
											<Label htmlFor="add-scope">Add scope</Label>
											<Input
												id="add-scope"
												value={newScope}
												onChange={(e) => setNewScope(e.target.value)}
												placeholder="e.g. demo:data:read"
												className="font-mono text-sm"
											/>
										</div>
										<Button
											type="button"
											variant="secondary"
											disabled={busy || !newScope.trim()}
											className="shrink-0 font-mono text-sm"
											onClick={() => addScopeMutation.mutate()}
										>
											Add to set
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					) : (
						<Card className="border-dashed border-primary/25 bg-muted/20">
							<CardContent className="py-12 text-center text-sm text-muted-foreground">
								Select a scope set from the list, or create a new one.
							</CardContent>
						</Card>
					)}

					<Card className="border-accent/20 bg-gradient-to-br from-card via-card to-accent/5 shadow-panel">
						<CardHeader>
							<CardTitle className="font-display text-xl">Create scope set</CardTitle>
							<CardDescription>
								Initial scopes can be edited after creation. Attach this set to clients from client management.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="space-y-1.5">
								<Label htmlFor="create-name">Name</Label>
								<Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="create-desc">Description</Label>
								<Input id="create-desc" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="create-scopes">Initial scopes (spaces or commas)</Label>
								<Textarea
									id="create-scopes"
									value={createScopes}
									onChange={(e) => setCreateScopes(e.target.value)}
									rows={2}
									className="font-mono text-sm"
								/>
							</div>
							<Button
								className="w-full font-semibold"
								disabled={busy || !createName.trim()}
								onClick={() => createMutation.mutate()}
							>
								Create scope set
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
