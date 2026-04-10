import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Copy, KeyRound, Layers, ShieldAlert, Terminal } from 'lucide-react';
import {
	FGAC_PERMISSION_NAMES,
	FGAC_RELATIONS,
	createProjectApiKey,
	normalizeBaseUrl,
	type ProjectApiKeyListItem,
	type ProjectApiKeyScope,
	revokeProjectApiKey,
	SYSTEM_FGAC_DOC_TYPES,
} from '@/lib/api';
import { useFgacSchemaQueries, useProjectApiKeysQuery, useProjectDetailQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';

const DEFAULT_SCOPES: ProjectApiKeyScope[] = ['read_fgac_schema'];

const BUILTIN_RELATION_DEFAULTS: readonly {
	readonly relation: (typeof FGAC_RELATIONS)[number];
	readonly permissions: readonly string[];
	readonly inherits: readonly string[];
}[] = [
	{ relation: 'viewer', permissions: ['read'], inherits: [] },
	{ relation: 'editor', permissions: ['write'], inherits: ['viewer'] },
	{ relation: 'member', permissions: ['user'], inherits: [] },
	{ relation: 'owner', permissions: ['admin', 'manage_permissions'], inherits: ['editor'] },
	{
		relation: 'admin',
		permissions: ['admin', 'superadmin', 'manage_permissions'],
		inherits: ['owner'],
	},
];

function formatInstant(value: string | Date | null | undefined): string {
	if (value === null || value === undefined) {
		return '—';
	}
	if (typeof value === 'string') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
	}
	return value.toLocaleString();
}

function TagChips({ items }: { readonly items: readonly string[] }) {
	if (items.length === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-wrap gap-1">
			{items.map((x) => (
				<span
					key={x}
					className="rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground/90"
				>
					{x}
				</span>
			))}
		</div>
	);
}

async function copyText(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
}

export function IntegrationPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/integration' });
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);
	const queryClient = useQueryClient();

	const keysQuery = useProjectApiKeysQuery(slug);
	const detailQuery = useProjectDetailQuery(slug);

	const docTypesForUi = useMemo(
		() => detailQuery.data?.fgacDocTypes.merged ?? [],
		[detailQuery.data?.fgacDocTypes.merged],
	);
	const schemaQueries = useFgacSchemaQueries(slug, docTypesForUi);

	const [keyName, setKeyName] = useState('');
	const [newSecret, setNewSecret] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [revokeError, setRevokeError] = useState<string | null>(null);

	const canManageKeys = ['owner', 'admin'].includes(detailQuery.data?.role ?? '');

	const specOrigin = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	const createMutation = useMutation({
		mutationFn: () =>
			createProjectApiKey(apiBaseUrl, slug, {
				name: keyName.trim() || 'Integration',
				scopes: DEFAULT_SCOPES,
			}),
		onSuccess: async (res) => {
			setNewSecret(res.apiKey);
			setKeyName('');
			setFormError(null);
			await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'api-keys'] });
		},
		onError: (err) => {
			setFormError(err instanceof Error ? err.message : 'Could not create key');
		},
	});

	const revokeMutation = useMutation({
		mutationFn: (keyId: string) => revokeProjectApiKey(apiBaseUrl, slug, keyId),
		onSuccess: async () => {
			setRevokeError(null);
			await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'api-keys'] });
		},
		onError: (err) => {
			setRevokeError(err instanceof Error ? err.message : 'Could not revoke key');
		},
	});

	const keys = keysQuery.data ?? [];

	return (
		<div className="space-y-10">
			<header className="relative overflow-hidden rounded-[1.25rem] border border-primary/25 bg-gradient-to-br from-card via-card to-secondary/40 p-6 shadow-panel md:p-9">
				<div
					className="pointer-events-none absolute -right-10 top-0 h-56 w-56 rotate-12 rounded-[2rem] border border-primary/15 bg-primary/[0.06]"
					aria-hidden
				/>
				<div className="relative space-y-3">
					<p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">Project workspace</p>
					<h1 className="font-display text-3xl font-semibold tracking-tight md:text-[2.15rem]">Integration vault</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						Mint a key, then call the FGAC export to learn doc types and relation definitions (permissions + inheritance)
						for this project.
					</p>
					<p className="font-mono text-xs text-muted-foreground/90">/{slug}</p>
				</div>
			</header>

			<div className="grid gap-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] xl:items-start">
				<div className="space-y-6">
					{newSecret ? (
						<div
							className="animate-rise-in rounded-2xl border border-destructive/30 bg-destructive/[0.07] p-5 shadow-sm"
							style={{ animationDelay: '0ms' }}
						>
							<div className="flex items-start gap-3">
								<ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.75} />
								<div className="min-w-0 flex-1 space-y-3">
									<div>
										<p className="font-display text-lg font-semibold text-foreground">Copy this secret now</p>
										<p className="text-sm text-muted-foreground">It will not be shown again.</p>
									</div>
									<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-foreground">
										{newSecret}
									</pre>
									<div className="flex flex-wrap gap-2">
										<Button type="button" size="sm" variant="secondary" onClick={() => void copyText(newSecret)}>
											<Copy className="mr-1.5 size-3.5" strokeWidth={2} />
											Copy
										</Button>
										<Button type="button" size="sm" variant="outline" onClick={() => setNewSecret(null)}>
											Dismiss
										</Button>
									</div>
								</div>
							</div>
						</div>
					) : null}

					<Card className="border-border/70 shadow-sm">
						<CardHeader className="space-y-1">
							<div className="flex items-center gap-2 text-primary">
								<KeyRound className="size-5" strokeWidth={1.75} />
								<CardTitle className="font-display text-xl">API keys</CardTitle>
							</div>
							<CardDescription>
								{canManageKeys
									? 'Create and revoke keys. Each key is tied to this project only.'
									: 'You need admin or owner on this project to manage keys. FGAC export docs are still visible.'}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{canManageKeys ? (
								<div className="rounded-xl border border-dashed border-primary/25 bg-primary/[0.03] p-4">
									<div className="space-y-3">
										<div className="space-y-1.5">
											<Label htmlFor="api-key-label">Label</Label>
											<Input
												id="api-key-label"
												placeholder="e.g. prod-fgac-sync"
												value={keyName}
												onChange={(e) => setKeyName(e.target.value)}
											/>
										</div>
										<p className="text-xs text-muted-foreground">
											Scope: <span className="font-mono text-foreground/90">read_fgac_schema</span> — read-only export
											described in the right column.
										</p>
										<Button
											type="button"
											disabled={createMutation.isPending}
											onClick={() => createMutation.mutate()}
											className="w-full sm:w-auto"
										>
											Mint new key
										</Button>
										{formError ? <p className="text-xs text-destructive">{formError}</p> : null}
									</div>
								</div>
							) : null}

							{keysQuery.isLoading ? (
								<p className="text-sm text-muted-foreground">Loading keys…</p>
							) : keys.length === 0 ? (
								<p className="text-sm text-muted-foreground">No keys yet.</p>
							) : (
								<ul className="space-y-3">
									{keys.map((row: ProjectApiKeyListItem, index: number) => (
										<li
											key={row.id}
											className={cn(
												'animate-rise-in relative rounded-xl border border-border/60 bg-background/60 pl-4 pr-3 py-3.5 shadow-sm',
												'before:absolute before:left-0 before:top-2 before:h-[calc(100%-1rem)] before:w-1 before:rounded-full before:bg-primary/55',
											)}
											style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
										>
											<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
												<div className="min-w-0 space-y-1">
													<p className="truncate font-medium">{row.name || 'Unnamed key'}</p>
													<p className="font-mono text-[11px] text-muted-foreground">{row.keyPrefix}…</p>
													<p className="text-xs text-muted-foreground">
														Scopes:{' '}
														<span className="font-mono text-foreground/80">{row.scopes.join(', ') || '—'}</span>
													</p>
													<p className="text-[11px] text-muted-foreground">
														Created {formatInstant(row.createdAt)}
														{' · '}
														Last used {formatInstant(row.lastUsedAt)}
														{row.revokedAt ? ` · Revoked ${formatInstant(row.revokedAt)}` : ''}
													</p>
												</div>
												{canManageKeys && !row.revokedAt ? (
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
														disabled={revokeMutation.isPending}
														onClick={() => revokeMutation.mutate(row.id)}
													>
														Revoke
													</Button>
												) : null}
											</div>
										</li>
									))}
								</ul>
							)}
							{revokeError ? <p className="text-xs text-destructive">{revokeError}</p> : null}
						</CardContent>
					</Card>
				</div>

				<div className="space-y-6">
					<Card className="border-border/70 shadow-sm">
						<CardHeader className="space-y-1">
							<div className="flex items-center gap-2 text-primary">
								<Layers className="size-5" strokeWidth={1.75} />
								<CardTitle className="font-display text-xl">FGAC export payload</CardTitle>
							</div>
							<CardDescription>
								With scope <span className="font-mono text-foreground/80">read_fgac_schema</span>, one GET returns the
								permission <strong className="font-medium text-foreground">schema</strong> for this project — not grants,
								not users. Use it to align external authorization with this FGAC model.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6 text-sm leading-relaxed">
							<div className="rounded-xl border border-border/60 bg-secondary/15 p-4">
								<p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Request</p>
								<pre className="mt-2 overflow-x-auto font-mono text-[10px] text-foreground/90">
									GET {specOrigin}/api/projects/{slug}/integration/fgac-schema
								</pre>
								<p className="mt-2 text-xs text-muted-foreground">
									Header{' '}
									<span className="font-mono text-foreground/85">Authorization: Bearer &lt;full key&gt;</span> — prefix{' '}
									<span className="font-mono">oidcproj_</span>. Session cookies are not used on this route.
								</p>
								<div className="mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-3">
									<Terminal className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />
									<pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[10px] text-muted-foreground">
										{`curl -sS \\\n  -H "Authorization: Bearer $OIDC_PROJECT_KEY" \\\n  "${specOrigin}/api/projects/${slug}/integration/fgac-schema"`}
									</pre>
								</div>
							</div>

							<section className="space-y-2">
								<h3 className="font-display text-base font-semibold text-foreground">Top-level fields</h3>
								<ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
									<li>
										<span className="font-mono text-foreground/90">projectSlug</span> — confirms which project the
										payload belongs to (same as the path slug you called).
									</li>
									<li>
										<span className="font-mono text-foreground/90">fgacDocTypes</span> — three parallel lists:{' '}
										<span className="font-mono">system</span> is always{' '}
										<span className="font-mono text-foreground/90">{SYSTEM_FGAC_DOC_TYPES.join(', ')}</span>;{' '}
										<span className="font-mono">custom</span> is extra doc types defined for this project;{' '}
										<span className="font-mono">merged</span> is system then custom (what FGAC uses everywhere).
									</li>
									<li>
										<span className="font-mono text-foreground/90">relationsByDocType</span> — object keyed by each
										merged doc type. Value shape matches list-relations:{' '}
										<span className="font-mono">{'{ relations: { [relationName]: { permissions, inherits } } }'}</span>.
									</li>
								</ul>
							</section>

							<section className="space-y-2">
								<h3 className="font-display text-base font-semibold text-foreground">Each relation entry</h3>
								<p className="text-xs text-muted-foreground">
									Under <span className="font-mono">relations</span>, every relation name maps to:
								</p>
								<ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
									<li>
										<span className="font-mono text-foreground/90">permissions</span> — string capability tokens
										granted <em>directly</em> to holders of this relation on a resource of this doc type. In this product,
										valid tokens are{' '}
										<span className="font-mono text-foreground/90">{FGAC_PERMISSION_NAMES.join(', ')}</span>.
									</li>
									<li>
										<span className="font-mono text-foreground/90">inherits</span> — names of <em>other</em> relations on
										the same doc type whose definitions chain into this one (transitive effective caps). Empty means no
										inheritance links.
									</li>
								</ul>
							</section>

							<section className="space-y-3">
								<h3 className="font-display text-base font-semibold text-foreground">Built-in relation names</h3>
								<p className="text-xs text-muted-foreground">
									Relation <em>names</em> are drawn from this set unless you define custom ones on a doc type:{' '}
									<span className="font-mono text-foreground/90">{FGAC_RELATIONS.join(', ')}</span>. Default meaning (before
									any project edits) is:
								</p>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[100px] font-mono text-[10px] uppercase">Relation</TableHead>
											<TableHead className="font-mono text-[10px] uppercase">Direct permissions</TableHead>
											<TableHead className="w-[160px] font-mono text-[10px] uppercase">Inherits</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{BUILTIN_RELATION_DEFAULTS.map((row) => (
											<TableRow key={row.relation}>
												<TableCell className="font-mono text-xs font-medium">{row.relation}</TableCell>
												<TableCell>
													<TagChips items={[...row.permissions]} />
												</TableCell>
												<TableCell>
													<TagChips items={[...row.inherits]} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								<p className="text-[11px] text-muted-foreground">
									Custom doc types and custom relation names appear only in the live tables below and in the export once
									you define them under Permissions.
								</p>
							</section>

							<section className="space-y-3">
								<h3 className="font-display text-base font-semibold text-foreground">This project (live)</h3>
								<p className="text-xs text-muted-foreground">
									Same data shape as <span className="font-mono">relationsByDocType</span> in the export; loaded with your
									admin session here for convenience.
								</p>
								<div className="space-y-4">
									{(docTypesForUi.length > 0 ? docTypesForUi : [...SYSTEM_FGAC_DOC_TYPES]).map((type) => {
											const q = schemaQueries.byType.get(type);
											const rels = q?.data?.relations ?? {};
											return (
												<div key={type} className="overflow-hidden rounded-xl border border-border/60">
													<div className="border-b border-border/50 bg-secondary/15 px-3 py-2">
														<p className="font-mono text-xs font-semibold text-foreground">{type}</p>
													</div>
													<div className="p-0">
														{!q || q.isLoading ? (
															<p className="p-3 text-xs text-muted-foreground">Loading…</p>
														) : q.isError ? (
															<p className="p-3 text-xs text-destructive">
																{q.error instanceof Error ? q.error.message : 'Failed to load'}
															</p>
														) : Object.keys(rels).length === 0 ? (
															<p className="p-3 text-xs text-muted-foreground">No relations defined.</p>
														) : (
															<Table>
																<TableHeader>
																	<TableRow>
																		<TableHead className="w-[120px] font-mono text-[10px] uppercase">Relation</TableHead>
																		<TableHead className="font-mono text-[10px] uppercase">Permissions</TableHead>
																		<TableHead className="w-[180px] font-mono text-[10px] uppercase">Inherits</TableHead>
																	</TableRow>
																</TableHeader>
																<TableBody>
																	{Object.entries(rels).map(([name, meta]) => (
																		<TableRow key={name}>
																			<TableCell className="font-mono text-xs font-medium">{name}</TableCell>
																			<TableCell>
																				<TagChips items={meta.permissions} />
																			</TableCell>
																			<TableCell>
																				<TagChips items={meta.inherits} />
																			</TableCell>
																		</TableRow>
																	))}
																</TableBody>
															</Table>
														)}
													</div>
												</div>
											);
										})}
								</div>
							</section>

							<p className="text-[11px] text-muted-foreground">
								Machine-readable full API (all routes):{' '}
								<a
									className="font-mono text-primary underline-offset-4 hover:underline"
									href={`${specOrigin}/spec.json`}
									target="_blank"
									rel="noreferrer"
								>
									{specOrigin}/spec.json
								</a>
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
