import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Layers3, Link2, Search, ShieldCheck, Sparkles } from 'lucide-react';
import {
	addClientRedirectUri,
	attachClientScopeSet,
	createClientInProject,
	detachClientScopeSet,
	removeClientRedirectUri,
	updateClientInProject,
} from '@/lib/api';
import { useProjectClientsQuery, useProjectScopeSetsQuery } from '@/hooks/use-oidc-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAdminStore } from '@/stores/admin-store';

type ProjectClient = {
	readonly id: string;
	readonly name: string;
	readonly clientId: string;
	readonly isPublic: boolean;
	readonly isActive: boolean;
	readonly redirectUris: string[];
	readonly scopeSetIds: string[];
};

type ScopeSetRow = {
	readonly id: string;
	readonly name: string;
	readonly isDefault: boolean;
};

function parseItemList(raw: string): string[] {
	return Array.from(new Set(raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)));
}

function toMultiline(items: readonly string[]): string {
	return items.join('\n');
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	const left = new Set(a);
	const right = new Set(b);
	if (left.size !== right.size) {
		return false;
	}
	for (const item of left) {
		if (!right.has(item)) {
			return false;
		}
	}
	return true;
}

function toggleListItem(raw: string, item: string): string {
	const set = new Set(parseItemList(raw));
	if (set.has(item)) {
		set.delete(item);
	} else {
		set.add(item);
	}
	return Array.from(set).join('\n');
}

export function ClientsPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/clients' });
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const clientsQuery = useProjectClientsQuery(slug);
	const scopeSetsQuery = useProjectScopeSetsQuery(slug);
	const rows = (clientsQuery.data ?? []) as ProjectClient[];
	const scopeSetRows = (scopeSetsQuery.data ?? []) as ScopeSetRow[];

	const [searchQuery, setSearchQuery] = useState('');
	const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [editIsPublic, setEditIsPublic] = useState(true);
	const [editIsActive, setEditIsActive] = useState(true);
	const [editRedirectUris, setEditRedirectUris] = useState('');
	const [editScopeSetIds, setEditScopeSetIds] = useState('');

	const [createName, setCreateName] = useState('');
	const [createClientId, setCreateClientId] = useState('');
	const [createRedirectUris, setCreateRedirectUris] = useState('http://localhost:3000/callback');
	const [createIsPublic, setCreateIsPublic] = useState(true);
	const [createScopeSetIds, setCreateScopeSetIds] = useState('');
	const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

	const selectedClient = useMemo(
		() => rows.find((client) => client.id === selectedClientId) ?? null,
		[rows, selectedClientId],
	);

	const filteredRows = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) {
			return rows;
		}
		return rows.filter(
			(client) =>
				client.name.toLowerCase().includes(query) || client.clientId.toLowerCase().includes(query),
		);
	}, [rows, searchQuery]);

	const totalCallbacks = useMemo(
		() => rows.reduce((sum, client) => sum + client.redirectUris.length, 0),
		[rows],
	);
	const activeCount = useMemo(() => rows.filter((client) => client.isActive).length, [rows]);
	const publicCount = useMemo(() => rows.filter((client) => client.isPublic).length, [rows]);
	const confidentialCount = rows.length - publicCount;

	const editRedirectList = useMemo(() => parseItemList(editRedirectUris), [editRedirectUris]);
	const editScopeSetList = useMemo(() => parseItemList(editScopeSetIds), [editScopeSetIds]);
	const editScopeSetSet = useMemo(() => new Set(editScopeSetList), [editScopeSetList]);
	const createScopeSetSet = useMemo(() => new Set(parseItemList(createScopeSetIds)), [createScopeSetIds]);

	const hasEditChanges = useMemo(() => {
		if (!selectedClient) {
			return false;
		}
		return (
			editName.trim() !== selectedClient.name ||
			editIsPublic !== selectedClient.isPublic ||
			editIsActive !== selectedClient.isActive ||
			!sameSet(editRedirectList, selectedClient.redirectUris) ||
			!sameSet(editScopeSetList, selectedClient.scopeSetIds)
		);
	}, [editIsActive, editIsPublic, editName, editRedirectList, editScopeSetList, selectedClient]);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	useEffect(() => {
		if (!selectedClientId && rows.length > 0) {
			setSelectedClientId(rows[0].id);
		}
		if (selectedClientId && !rows.some((client) => client.id === selectedClientId) && rows.length > 0) {
			setSelectedClientId(rows[0].id);
		}
	}, [rows, selectedClientId]);

	useEffect(() => {
		if (!selectedClient) {
			setEditName('');
			setEditIsPublic(true);
			setEditIsActive(true);
			setEditRedirectUris('');
			setEditScopeSetIds('');
			return;
		}
		setEditName(selectedClient.name);
		setEditIsPublic(selectedClient.isPublic);
		setEditIsActive(selectedClient.isActive);
		setEditRedirectUris(toMultiline(selectedClient.redirectUris));
		setEditScopeSetIds(toMultiline(selectedClient.scopeSetIds));
	}, [selectedClient]);

	const invalidateClients = () =>
		queryClient.invalidateQueries({ queryKey: ['projects', slug, 'clients'] });

	const createClientMutation = useMutation({
		mutationFn: async () => {
			const redirectUris = parseItemList(createRedirectUris);
			if (redirectUris.length === 0) {
				throw new Error('At least one redirect URI is required');
			}
			return createClientInProject(apiBaseUrl, slug, {
				name: createName.trim(),
				clientId: createClientId.trim(),
				isPublic: createIsPublic,
				redirectUris,
				scopeSetIds: parseItemList(createScopeSetIds),
			});
		},
		onSuccess: async (created) => {
			setCreateName('');
			setCreateClientId('');
			setCreateRedirectUris('http://localhost:3000/callback');
			setCreateScopeSetIds('');
			setSelectedClientId(created.id);
			setBanner({ type: 'ok', text: 'Client created successfully.' });
			await invalidateClients();
		},
		onError: (error) => {
			setBanner({ type: 'err', text: error instanceof Error ? error.message : 'Failed to create client' });
		},
	});

	const updateClientMutation = useMutation({
		mutationFn: async () => {
			if (!selectedClient) {
				throw new Error('Select a client to edit');
			}

			const nextRedirectUris = parseItemList(editRedirectUris);
			if (nextRedirectUris.length === 0) {
				throw new Error('At least one redirect URI is required');
			}
			const nextScopeSetIds = parseItemList(editScopeSetIds);

			await updateClientInProject(apiBaseUrl, slug, selectedClient.id, {
				name: editName.trim(),
				isPublic: editIsPublic,
				isActive: editIsActive,
			});

			const existingRedirectUris = new Set(selectedClient.redirectUris);
			const nextRedirectSet = new Set(nextRedirectUris);
			const redirectUrisToAdd = nextRedirectUris.filter((uri) => !existingRedirectUris.has(uri));
			const redirectUrisToRemove = selectedClient.redirectUris.filter((uri) => !nextRedirectSet.has(uri));

			for (const uri of redirectUrisToAdd) {
				await addClientRedirectUri(apiBaseUrl, slug, selectedClient.id, uri);
			}
			for (const uri of redirectUrisToRemove) {
				await removeClientRedirectUri(apiBaseUrl, slug, selectedClient.id, uri);
			}

			const existingScopeSetIds = new Set(selectedClient.scopeSetIds);
			const nextScopeSetIdSet = new Set(nextScopeSetIds);
			const scopeSetIdsToAdd = nextScopeSetIds.filter((scopeSetId) => !existingScopeSetIds.has(scopeSetId));
			const scopeSetIdsToRemove = selectedClient.scopeSetIds.filter(
				(scopeSetId) => !nextScopeSetIdSet.has(scopeSetId),
			);

			for (const scopeSetId of scopeSetIdsToAdd) {
				await attachClientScopeSet(apiBaseUrl, slug, selectedClient.id, scopeSetId);
			}
			for (const scopeSetId of scopeSetIdsToRemove) {
				await detachClientScopeSet(apiBaseUrl, slug, selectedClient.id, scopeSetId);
			}
		},
		onSuccess: async () => {
			setBanner({ type: 'ok', text: 'Client updated successfully.' });
			await invalidateClients();
		},
		onError: (error) => {
			setBanner({ type: 'err', text: error instanceof Error ? error.message : 'Failed to update client' });
		},
	});

	const busy = createClientMutation.isPending || updateClientMutation.isPending;

	return (
		<div className="space-y-8">
			<header className="access-ledger-hero relative overflow-hidden rounded-2xl border border-primary/15 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
				<div className="access-ledger-noise" aria-hidden />
				<div
					className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/35 blur-3xl"
					aria-hidden
				/>
				<div
					className="pointer-events-none absolute -bottom-20 left-1/3 h-52 w-52 rounded-full bg-primary/20 blur-3xl"
					aria-hidden
				/>
				<div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
					<div className="animate-rise-in">
						<p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">OIDC · Control Plane</p>
						<h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
							Client operations deck
						</h1>
						<p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
							Search, inspect, and reconfigure OAuth clients with faster context. Use multiline callback and scope-set
							editors to avoid CSV mistakes and ship updates safely.
						</p>
						<p className="mt-3 font-mono text-xs text-muted-foreground">
							Project <span className="text-foreground">{slug}</span>
						</p>
					</div>
					<div className="grid grid-cols-2 gap-3 text-xs font-mono">
						<div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
							<p className="text-muted-foreground">Clients</p>
							<p className="mt-1 text-2xl font-semibold text-foreground">{rows.length}</p>
						</div>
						<div className="rounded-xl border border-accent/35 bg-accent/10 p-3">
							<p className="text-muted-foreground">Active</p>
							<p className="mt-1 text-2xl font-semibold text-foreground">{activeCount}</p>
						</div>
						<div className="rounded-xl border border-border/70 bg-card/70 p-3">
							<p className="text-muted-foreground">Public</p>
							<p className="mt-1 text-2xl font-semibold text-foreground">{publicCount}</p>
						</div>
						<div className="rounded-xl border border-border/70 bg-card/70 p-3">
							<p className="text-muted-foreground">Confidential</p>
							<p className="mt-1 text-2xl font-semibold text-foreground">{confidentialCount}</p>
						</div>
					</div>
				</div>
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

			<div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_1fr]">
				<Card className="border-primary/10 shadow-panel">
					<CardHeader className="pb-3">
						<CardTitle className="font-display text-xl">Client directory</CardTitle>
						<CardDescription>{totalCallbacks} callback URLs across this project.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Search by name or client ID"
								className="pl-9"
							/>
						</div>
						<div className="max-h-[560px] space-y-2 overflow-auto pr-1">
							{clientsQuery.isLoading ? (
								<p className="text-sm text-muted-foreground">Loading clients...</p>
							) : filteredRows.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									{rows.length === 0 ? 'No clients yet.' : 'No clients match this search.'}
								</p>
							) : (
								filteredRows.map((client, index) => {
									const selected = client.id === selectedClientId;
									return (
										<button
											key={client.id}
											type="button"
											onClick={() => setSelectedClientId(client.id)}
											className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
												selected
													? 'access-ledger-matrix border-primary/55 bg-primary/10 shadow-lg shadow-primary/10'
													: 'border-border/70 bg-card/70 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card'
											} ${index < 6 ? 'animate-rise-in' : ''}`}
											style={index < 6 ? { animationDelay: `${index * 60}ms` } : undefined}
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="text-sm font-semibold text-foreground">{client.name}</p>
													<p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{client.clientId}</p>
												</div>
												<Badge variant="outline" className="text-[10px]">
													{client.redirectUris.length} URLs
												</Badge>
											</div>
											<div className="mt-2 flex flex-wrap gap-1.5">
												<Badge variant="outline" className="text-[10px]">
													{client.isPublic ? 'Public' : 'Confidential'}
												</Badge>
												<Badge
													variant="outline"
													className={`text-[10px] ${
														client.isActive
															? 'border-accent/50 bg-accent/12 text-accent-foreground'
															: 'border-destructive/40 bg-destructive/10 text-destructive'
													}`}
												>
													{client.isActive ? 'Active' : 'Inactive'}
												</Badge>
											</div>
										</button>
									);
								})
							)}
						</div>
					</CardContent>
				</Card>

				<div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
					<Card className="border-primary/10 shadow-panel">
						<CardHeader>
							<CardTitle className="font-display text-xl">Edit selected client</CardTitle>
							<CardDescription>
								{selectedClient ? `Editing ${selectedClient.clientId}` : 'Pick a client from the directory first.'}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-xl border border-border/70 bg-card/60 p-3">
									<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Client ID</p>
									<p className="mt-1 break-all font-mono text-xs text-foreground">
										{selectedClient?.clientId ?? 'No selection'}
									</p>
								</div>
								<div className="rounded-xl border border-border/70 bg-card/60 p-3">
									<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
									<div className="mt-1 flex flex-wrap gap-1.5">
										<Badge variant="outline" className="text-[10px]">
											{editIsPublic ? 'Public' : 'Confidential'}
										</Badge>
										<Badge
											variant="outline"
											className={`text-[10px] ${
												editIsActive
													? 'border-accent/50 bg-accent/12 text-accent-foreground'
													: 'border-destructive/40 bg-destructive/10 text-destructive'
											}`}
										>
											{editIsActive ? 'Active' : 'Inactive'}
										</Badge>
									</div>
								</div>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="edit-client-name">Display name</Label>
								<Input
									id="edit-client-name"
									value={editName}
									disabled={!selectedClient}
									onChange={(event) => setEditName(event.target.value)}
									placeholder="e.g. Admin Dashboard"
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="edit-redirect-uris" className="flex items-center gap-2">
									<Link2 className="h-4 w-4" />
									Redirect URIs (one per line)
								</Label>
								<Textarea
									id="edit-redirect-uris"
									value={editRedirectUris}
									disabled={!selectedClient}
									onChange={(event) => setEditRedirectUris(event.target.value)}
									placeholder="https://app.example.com/callback"
									className="min-h-[120px]"
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="edit-scope-set-ids" className="flex items-center gap-2">
									<Layers3 className="h-4 w-4" />
									Scope set IDs (one per line)
								</Label>
								<Textarea
									id="edit-scope-set-ids"
									value={editScopeSetIds}
									disabled={!selectedClient}
									onChange={(event) => setEditScopeSetIds(event.target.value)}
									placeholder="Paste IDs, or use quick attach chips below"
									className="min-h-[100px]"
								/>
								<div className="flex flex-wrap gap-2">
									{scopeSetRows.map((scopeSet) => {
										const picked = editScopeSetSet.has(scopeSet.id);
										return (
											<button
												key={scopeSet.id}
												type="button"
												disabled={!selectedClient}
												onClick={() =>
													setEditScopeSetIds((prev) => toggleListItem(prev, scopeSet.id))
												}
												className={`rounded-full border px-3 py-1 text-xs transition ${
													picked
														? 'border-primary/55 bg-primary/12 text-foreground'
														: 'border-border/70 bg-card hover:border-primary/35'
												}`}
											>
												{scopeSet.name}
												{scopeSet.isDefault ? ' • default' : ''}
											</button>
										);
									})}
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-2">
								<label className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm">
									<input
										type="checkbox"
										className="h-4 w-4"
										checked={editIsPublic}
										disabled={!selectedClient}
										onChange={(event) => setEditIsPublic(event.target.checked)}
									/>
									Public client
								</label>
								<label className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm">
									<input
										type="checkbox"
										className="h-4 w-4"
										checked={editIsActive}
										disabled={!selectedClient}
										onChange={(event) => setEditIsActive(event.target.checked)}
									/>
									Active
								</label>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									className="min-w-36"
									disabled={updateClientMutation.isPending || !selectedClient || !editName.trim() || !hasEditChanges}
									onClick={() => updateClientMutation.mutate()}
								>
									<ShieldCheck className="mr-2 h-4 w-4" />
									Save changes
								</Button>
								<Button
									variant="outline"
									disabled={!selectedClient || updateClientMutation.isPending}
									onClick={() => {
										if (!selectedClient) {
											return;
										}
										setEditName(selectedClient.name);
										setEditIsPublic(selectedClient.isPublic);
										setEditIsActive(selectedClient.isActive);
										setEditRedirectUris(toMultiline(selectedClient.redirectUris));
										setEditScopeSetIds(toMultiline(selectedClient.scopeSetIds));
									}}
								>
									Reset
								</Button>
								{hasEditChanges ? (
									<span className="font-mono text-xs text-primary">Unsaved changes</span>
								) : null}
							</div>
						</CardContent>
					</Card>

					<Card className="border-primary/10 shadow-panel">
						<CardHeader>
							<CardTitle className="font-display text-xl">Create new client</CardTitle>
							<CardDescription>
								Create app credentials and wire callback + scopes in one pass.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="create-client-name">Display name</Label>
								<Input
									id="create-client-name"
									value={createName}
									onChange={(event) => setCreateName(event.target.value)}
									placeholder="Partner portal"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="create-client-id">Client ID</Label>
								<Input
									id="create-client-id"
									value={createClientId}
									onChange={(event) => setCreateClientId(event.target.value)}
									placeholder="partner-portal-app"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="create-redirect-uris">Redirect URIs (one per line)</Label>
								<Textarea
									id="create-redirect-uris"
									value={createRedirectUris}
									onChange={(event) => setCreateRedirectUris(event.target.value)}
									className="min-h-[110px]"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="create-scope-set-ids">Scope set IDs (one per line)</Label>
								<Textarea
									id="create-scope-set-ids"
									value={createScopeSetIds}
									onChange={(event) => setCreateScopeSetIds(event.target.value)}
									placeholder="optional"
									className="min-h-[90px]"
								/>
								<div className="flex flex-wrap gap-2">
									{scopeSetRows.map((scopeSet) => {
										const picked = createScopeSetSet.has(scopeSet.id);
										return (
											<button
												key={scopeSet.id}
												type="button"
												onClick={() =>
													setCreateScopeSetIds((prev) => toggleListItem(prev, scopeSet.id))
												}
												className={`rounded-full border px-3 py-1 text-xs transition ${
													picked
														? 'border-accent/55 bg-accent/18 text-foreground'
														: 'border-border/70 bg-card hover:border-accent/35'
												}`}
											>
												{scopeSet.name}
											</button>
										);
									})}
								</div>
							</div>
							<label className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm">
								<input
									type="checkbox"
									className="h-4 w-4"
									checked={createIsPublic}
									onChange={(event) => setCreateIsPublic(event.target.checked)}
								/>
								Public client
							</label>
							<Button
								className="w-full"
								disabled={busy || !createName.trim() || !createClientId.trim()}
								onClick={() => createClientMutation.mutate()}
							>
								<Sparkles className="mr-2 h-4 w-4" />
								Create client
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
