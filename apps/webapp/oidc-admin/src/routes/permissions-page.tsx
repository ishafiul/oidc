import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
	addProjectFgacDocType,
	FGAC_DOC_TYPES,
	FGAC_PERMISSION_NAMES,
	FGAC_RELATIONS,
	type FgacDocType,
	addUserToProjectGroup,
	defineProjectRelation,
	deleteProjectRelation,
	getMyPermissionsOnResource,
	grantRelation as grantFgacTuple,
	removeProjectFgacDocType,
	removeUserFromProjectGroup,
	revokeRelation,
	SYSTEM_FGAC_DOC_TYPES,
} from '@/lib/api';
import {
	useFgacSchemaQueries,
	useProjectClientsQuery,
	useProjectDetailQuery,
	useProjectGroupMembersQuery,
	useProjectGroupRelationsQuery,
	useProjectGroupsQuery,
	useProjectMembersQuery,
	useProjectScopeSetsQuery,
	useUserFgacRelationsQueries,
} from '@/hooks/use-oidc-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';
import {
	BookOpen,
	Boxes,
	Clock,
	GitBranch,
	Pencil,
	Search,
	Shield,
	Trash2,
	UserPlus,
	UsersRound,
} from 'lucide-react';

const DOC_LABELS: Record<string, string> = {
	project: 'Project',
	client: 'OAuth client',
	scope_set: 'Scope set',
	user: 'User resource',
};

function docTypeLabel(t: string): string {
	return DOC_LABELS[t] ?? t;
}

function isBuiltinFgacRelation(name: string): boolean {
	return (FGAC_RELATIONS as readonly string[]).includes(name);
}

function defaultGrantExpiryLocalValue(): string {
	const d = new Date();
	d.setTime(d.getTime() + 7 * 24 * 60 * 60 * 1000);
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const h = String(d.getHours()).padStart(2, '0');
	const min = String(d.getMinutes()).padStart(2, '0');
	return `${y}-${mo}-${day}T${h}:${min}`;
}

type TabId = 'schema' | 'grants' | 'groups' | 'inspector' | 'advanced';

function ChipList({ items }: { readonly items: readonly string[] | null | undefined }) {
	const list = items ?? [];
	if (list.length === 0) return <span className="text-muted-foreground">—</span>;
	return (
		<div className="flex flex-wrap gap-1">
			{list.map((p) => (
				<Badge key={p} variant="secondary" className="font-mono text-[10px] font-normal normal-case tracking-normal">
					{p}
				</Badge>
			))}
		</div>
	);
}

export function PermissionsPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/permissions' });
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const [tab, setTab] = useState<TabId>('schema');
	const [userPickQuery, setUserPickQuery] = useState('');
	const [groupPickQuery, setGroupPickQuery] = useState('');
	const [inspectorUserQuery, setInspectorUserQuery] = useState('');
	const [selectedInspectorUserId, setSelectedInspectorUserId] = useState<string | null>(null);

	const [subjectMode, setSubjectMode] = useState<'user' | 'group'>('user');
	const [grantUserId, setGrantUserId] = useState<string | null>(null);
	const [grantGroupSearchQuery, setGrantGroupSearchQuery] = useState('');
	const [grantGroupSelected, setGrantGroupSelected] = useState<string | null>(null);
	const [grantGroupManual, setGrantGroupManual] = useState('');
	const [pickedRelation, setPickedRelation] = useState<string>(FGAC_RELATIONS[0]);
	const [grantResourceType, setGrantResourceType] = useState<FgacDocType>('project');
	const [grantResourceId, setGrantResourceId] = useState('');
	const [grantExpiryLimited, setGrantExpiryLimited] = useState(false);
	const [grantExpiryAtLocal, setGrantExpiryAtLocal] = useState('');
	const [grantResourceUserQuery, setGrantResourceUserQuery] = useState('');
	const [grantError, setGrantError] = useState<string | null>(null);

	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [addToGroupUserQuery, setAddToGroupUserQuery] = useState('');
	const [newGroupName, setNewGroupName] = useState('');
	const [groupActionError, setGroupActionError] = useState<string | null>(null);

	const [simResourceType, setSimResourceType] = useState<FgacDocType>('project');
	const [simResourceId, setSimResourceId] = useState('');

	const [advType, setAdvType] = useState<FgacDocType>('project');
	const [advRelationName, setAdvRelationName] = useState('');
	const [advPerms, setAdvPerms] = useState<string[]>(['read']);
	const [advInherits, setAdvInherits] = useState<string[]>([]);
	const [delRelation, setDelRelation] = useState('');
	const [advError, setAdvError] = useState<string | null>(null);
	const [schemaActionError, setSchemaActionError] = useState<string | null>(null);
	const [newFgacDocTypeName, setNewFgacDocTypeName] = useState('');
	const [docTypeActionError, setDocTypeActionError] = useState<string | null>(null);

	const projectDetailQuery = useProjectDetailQuery(slug);
	const membersQuery = useProjectMembersQuery(slug);
	const clientsQuery = useProjectClientsQuery(slug);
	const scopeSetsQuery = useProjectScopeSetsQuery(slug);
	const docTypesForUi = useMemo(
		() => projectDetailQuery.data?.fgacDocTypes.merged ?? [...FGAC_DOC_TYPES],
		[projectDetailQuery.data?.fgacDocTypes.merged],
	);

	const schemaQueries = useFgacSchemaQueries(slug, docTypesForUi);
	const groupsQuery = useProjectGroupsQuery(slug);
	const groupMembersQuery = useProjectGroupMembersQuery(slug, selectedGroup);
	const groupRelationsQuery = useProjectGroupRelationsQuery(slug, selectedGroup);
	const userRelQueries = useUserFgacRelationsQueries(slug, selectedInspectorUserId, docTypesForUi);

	useEffect(() => {
		if (docTypesForUi.length === 0) return;
		if (!docTypesForUi.includes(advType)) setAdvType(docTypesForUi[0]!);
	}, [docTypesForUi, advType]);

	useEffect(() => {
		if (docTypesForUi.length === 0) return;
		if (!docTypesForUi.includes(grantResourceType)) setGrantResourceType(docTypesForUi[0]!);
	}, [docTypesForUi, grantResourceType]);

	useEffect(() => {
		if (docTypesForUi.length === 0) return;
		if (!docTypesForUi.includes(simResourceType)) setSimResourceType(docTypesForUi[0]!);
	}, [docTypesForUi, simResourceType]);

	const projectId = projectDetailQuery.data?.id ?? null;

	const memberById = useMemo(() => {
		const m = new Map<string, { email: string; name: string | null }>();
		for (const row of membersQuery.data ?? []) {
			m.set(row.userId, {
				email: row.user?.email ?? row.userId,
				name: row.user?.name ?? null,
			});
		}
		return m;
	}, [membersQuery.data]);

	const resolveLabel = useMemo(() => {
		return (type: FgacDocType, id: string): string => {
			if (type === 'project' && projectId === id) return projectDetailQuery.data?.name ?? id.slice(0, 8);
			if (type === 'client') {
				const c = clientsQuery.data?.find((x) => x.id === id);
				return c ? `${c.name} (${c.clientId})` : id.slice(0, 8);
			}
			if (type === 'scope_set') {
				const s = scopeSetsQuery.data?.find((x) => x.id === id);
				return s?.name ?? id.slice(0, 8);
			}
			if (type === 'user') {
				const u = memberById.get(id);
				return u ? `${u.email}` : id.slice(0, 8);
			}
			return id.slice(0, 8);
		};
	}, [projectId, projectDetailQuery.data?.name, clientsQuery.data, scopeSetsQuery.data, memberById]);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	useEffect(() => {
		if (grantResourceType === 'project' && projectId) {
			setGrantResourceId(projectId);
		}
	}, [grantResourceType, projectId]);

	useEffect(() => {
		if (grantResourceType === 'project') {
			return;
		}
		setGrantResourceId('');
	}, [grantResourceType]);

	useEffect(() => {
		if (simResourceType === 'project' && projectId) {
			setSimResourceId(projectId);
		}
	}, [simResourceType, projectId]);

	useEffect(() => {
		if (subjectMode !== 'group') {
			setGrantGroupSearchQuery('');
			setGrantGroupSelected(null);
			setGrantGroupManual('');
		}
	}, [subjectMode]);

	const effectiveGrantGroup = grantGroupManual.trim() || grantGroupSelected?.trim() || '';

	const invalidatePerm = async () => {
		await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'permissions'] });
	};

	const invalidateProjectDetail = async () => {
		await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'detail', apiBaseUrl] });
	};

	const grantMut = useMutation({
		mutationFn: async () => {
			const subject =
				subjectMode === 'user'
					? `user:${grantUserId ?? ''}`
					: `group:${effectiveGrantGroup}`;
			if (subjectMode === 'user' && !grantUserId) throw new Error('Pick a user');
			if (subjectMode === 'group' && !effectiveGrantGroup) throw new Error('Pick or enter a group');
			let expiresAt: number | undefined;
			if (grantExpiryLimited) {
				if (!grantExpiryAtLocal.trim()) {
					throw new Error('Choose an expiry date and time');
				}
				const ms = new Date(grantExpiryAtLocal).getTime();
				if (!Number.isFinite(ms)) {
					throw new Error('Invalid expiry date');
				}
				if (ms <= Date.now()) {
					throw new Error('Expiry must be in the future');
				}
				expiresAt = ms;
			}
			return grantFgacTuple(apiBaseUrl, slug, {
				subject,
				relation: pickedRelation,
				resource: { type: grantResourceType, id: grantResourceId },
				...(expiresAt !== undefined ? { expiresAt } : {}),
			});
		},
		onSuccess: async () => {
			setGrantError(null);
			setGrantExpiryLimited(false);
			setGrantExpiryAtLocal('');
			await invalidatePerm();
		},
		onError: (e) => setGrantError(e instanceof Error ? e.message : 'Grant failed'),
	});

	const revokeMut = useMutation({
		mutationFn: async () => {
			const subject =
				subjectMode === 'user'
					? `user:${grantUserId ?? ''}`
					: `group:${effectiveGrantGroup}`;
			if (subjectMode === 'user' && !grantUserId) throw new Error('Pick a user');
			if (subjectMode === 'group' && !effectiveGrantGroup) throw new Error('Pick or enter a group');
			return revokeRelation(apiBaseUrl, slug, {
				subject,
				relation: pickedRelation,
				resource: { type: grantResourceType, id: grantResourceId },
			});
		},
		onSuccess: async () => {
			setGrantError(null);
			await invalidatePerm();
		},
		onError: (e) => setGrantError(e instanceof Error ? e.message : 'Revoke failed'),
	});

	const addGroupMut = useMutation({
		mutationFn: async ({ userId, group }: { userId: string; group: string }) =>
			addUserToProjectGroup(apiBaseUrl, slug, { user: userId, group }),
		onSuccess: async () => {
			setGroupActionError(null);
			await invalidatePerm();
		},
		onError: (e) => setGroupActionError(e instanceof Error ? e.message : 'Failed'),
	});

	const removeGroupMut = useMutation({
		mutationFn: async ({ userId, group }: { userId: string; group: string }) =>
			removeUserFromProjectGroup(apiBaseUrl, slug, { user: userId, group }),
		onSuccess: async () => {
			setGroupActionError(null);
			await invalidatePerm();
		},
		onError: (e) => setGroupActionError(e instanceof Error ? e.message : 'Failed'),
	});

	const defineMut = useMutation({
		mutationFn: async () =>
			defineProjectRelation(apiBaseUrl, slug, {
				type: advType,
				relation: advRelationName.trim(),
				permissions: advPerms,
				inherits: advInherits.length ? advInherits : undefined,
			}),
		onSuccess: async () => {
			setAdvError(null);
			await invalidatePerm();
		},
		onError: (e) => setAdvError(e instanceof Error ? e.message : 'Define failed'),
	});

	const deleteMut = useMutation({
		mutationFn: async () =>
			deleteProjectRelation(apiBaseUrl, slug, { type: advType, relation: delRelation }),
		onSuccess: async () => {
			setAdvError(null);
			await invalidatePerm();
		},
		onError: (e) => setAdvError(e instanceof Error ? e.message : 'Delete failed'),
	});

	const deleteSchemaRelationMut = useMutation({
		mutationFn: async ({ docType, relation }: { docType: FgacDocType; relation: string }) =>
			deleteProjectRelation(apiBaseUrl, slug, { type: docType, relation }),
		onSuccess: async () => {
			setSchemaActionError(null);
			await invalidatePerm();
		},
		onError: (e) => setSchemaActionError(e instanceof Error ? e.message : 'Delete failed'),
	});

	const addFgacDocTypeMut = useMutation({
		mutationFn: async () => addProjectFgacDocType(apiBaseUrl, slug, newFgacDocTypeName.trim()),
		onSuccess: async () => {
			setDocTypeActionError(null);
			setNewFgacDocTypeName('');
			await invalidateProjectDetail();
			await invalidatePerm();
		},
		onError: (e) => setDocTypeActionError(e instanceof Error ? e.message : 'Failed to add doc type'),
	});

	const removeFgacDocTypeMut = useMutation({
		mutationFn: async (name: string) => removeProjectFgacDocType(apiBaseUrl, slug, name),
		onSuccess: async () => {
			setDocTypeActionError(null);
			await invalidateProjectDetail();
			await invalidatePerm();
		},
		onError: (e) => setDocTypeActionError(e instanceof Error ? e.message : 'Failed to remove doc type'),
	});

	const simMut = useMutation({
		mutationFn: async () =>
			getMyPermissionsOnResource(apiBaseUrl, slug, { type: simResourceType, id: simResourceId }),
	});

	const filteredMembers = useMemo(() => {
		const q = userPickQuery.trim().toLowerCase();
		const rows = membersQuery.data ?? [];
		if (!q) return rows;
		return rows.filter((m) => {
			const email = m.user?.email?.toLowerCase() ?? '';
			const name = m.user?.name?.toLowerCase() ?? '';
			return m.userId.toLowerCase().includes(q) || email.includes(q) || name.includes(q);
		});
	}, [membersQuery.data, userPickQuery]);

	const filteredResourceMembers = useMemo(() => {
		const q = grantResourceUserQuery.trim().toLowerCase();
		const rows = membersQuery.data ?? [];
		if (!q) return rows;
		return rows.filter((m) => {
			const email = m.user?.email?.toLowerCase() ?? '';
			const name = m.user?.name?.toLowerCase() ?? '';
			return m.userId.toLowerCase().includes(q) || email.includes(q) || name.includes(q);
		});
	}, [membersQuery.data, grantResourceUserQuery]);

	const inspectorCandidates = useMemo(() => {
		const q = inspectorUserQuery.trim().toLowerCase();
		const rows = membersQuery.data ?? [];
		if (!q) return rows.slice(0, 8);
		return rows.filter((m) => {
			const email = m.user?.email?.toLowerCase() ?? '';
			const name = m.user?.name?.toLowerCase() ?? '';
			return m.userId.toLowerCase().includes(q) || email.includes(q) || name.includes(q);
		});
	}, [membersQuery.data, inspectorUserQuery]);

	const addGroupCandidates = useMemo(() => {
		const q = addToGroupUserQuery.trim().toLowerCase();
		const rows = membersQuery.data ?? [];
		if (!q) return rows.slice(0, 8);
		return rows.filter((m) => {
			const email = m.user?.email?.toLowerCase() ?? '';
			const name = m.user?.name?.toLowerCase() ?? '';
			return m.userId.toLowerCase().includes(q) || email.includes(q) || name.includes(q);
		});
	}, [membersQuery.data, addToGroupUserQuery]);

	const filteredGroups = useMemo(() => {
		const g = groupsQuery.data?.groups ?? [];
		const q = groupPickQuery.trim().toLowerCase();
		if (!q) return g;
		return g.filter((name) => name.toLowerCase().includes(q));
	}, [groupsQuery.data?.groups, groupPickQuery]);

	const filteredGrantGroups = useMemo(() => {
		const g = groupsQuery.data?.groups ?? [];
		const q = grantGroupSearchQuery.trim().toLowerCase();
		if (!q) return g;
		return g.filter((name) => name.toLowerCase().includes(q));
	}, [groupsQuery.data?.groups, grantGroupSearchQuery]);

	const advTypeRelations = schemaQueries.byType.get(advType)?.data?.relations ?? {};
	const advRelationNames = Object.keys(advTypeRelations);

	const grantTypeSchemaQuery = schemaQueries.byType.get(grantResourceType);

	const grantRelationNamesForResourceType = useMemo(() => {
		const q = grantTypeSchemaQuery;
		if (!q || q.isLoading) {
			return null as string[] | null;
		}
		const rels = q.data?.relations ?? {};
		const keys = Object.keys(rels);
		if (keys.length === 0) {
			return [] as string[];
		}
		const built = FGAC_RELATIONS.filter((r) => keys.includes(r));
		const custom = keys
			.filter((r) => !isBuiltinFgacRelation(r))
			.sort((a, b) => a.localeCompare(b));
		return [...built, ...custom];
	}, [grantTypeSchemaQuery, grantResourceType]);

	useEffect(() => {
		if (grantRelationNamesForResourceType === null || grantRelationNamesForResourceType.length === 0) {
			return;
		}
		if (!grantRelationNamesForResourceType.includes(pickedRelation)) {
			setPickedRelation(grantRelationNamesForResourceType[0]!);
		}
	}, [grantRelationNamesForResourceType, pickedRelation]);

	const tabBtn = (id: TabId, label: string) => (
		<button
			type="button"
			key={id}
			onClick={() => setTab(id)}
			className={cn(
				'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
				tab === id
					? 'border-primary/40 bg-primary/[0.08] text-foreground'
					: 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-secondary/40 hover:text-foreground',
			)}
		>
			{label}
		</button>
	);

	const groupRelationsFlat = useMemo(() => {
		const rec = groupRelationsQuery.data?.groups ?? {};
		return Object.entries(rec).flatMap(([g, rels]) => rels.map((r) => ({ ...r, _group: g })));
	}, [groupRelationsQuery.data?.groups]);

	return (
		<div className="space-y-8">
			<header className="space-y-2">
				<p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary/90">FGAC</p>
				<h1 className="font-display text-3xl font-semibold tracking-tight">Permissions</h1>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					Relations bundle permissions and inheritance. Grants attach a subject (
					<span className="font-mono text-xs">user:</span> or <span className="font-mono text-xs">group:</span>) to a
					resource. Groups collect users; you can grant to a group like a user.
				</p>
			</header>

			<div className="flex flex-wrap gap-2">
				{tabBtn('schema', 'Schema')}
				{tabBtn('grants', 'Grant / revoke')}
				{tabBtn('groups', 'Groups')}
				{tabBtn('inspector', 'User inspector')}
				{tabBtn('advanced', 'Advanced')}
			</div>

			{tab === 'schema' ? (
				<div className="space-y-6">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="font-display text-lg">Document types</CardTitle>
							<CardDescription>
								System types apply to every project. Custom types are stored on this project only and extend FGAC
								resource <span className="font-mono">type</span> values (e.g. <span className="font-mono">blog_post</span>
								).
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<p className="mb-2 text-xs font-medium uppercase text-muted-foreground">System</p>
								<div className="flex flex-wrap gap-2">
									{(projectDetailQuery.data?.fgacDocTypes.system ?? [...SYSTEM_FGAC_DOC_TYPES]).map((t) => (
										<Badge key={t} variant="secondary">
											{docTypeLabel(t)}
										</Badge>
									))}
								</div>
							</div>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
								<div className="min-w-0 flex-1 space-y-1.5">
									<Label htmlFor="new-fgac-doc-type">Add custom type</Label>
									<Input
										id="new-fgac-doc-type"
										placeholder="blog_post"
										value={newFgacDocTypeName}
										onChange={(e) => setNewFgacDocTypeName(e.target.value)}
										className="font-mono text-sm"
									/>
								</div>
								<Button
									type="button"
									disabled={addFgacDocTypeMut.isPending || !newFgacDocTypeName.trim()}
									onClick={() => addFgacDocTypeMut.mutate()}
								>
									Add
								</Button>
							</div>
							<div>
								<p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Custom (this project)</p>
								{(projectDetailQuery.data?.fgacDocTypes.custom ?? []).length === 0 ? (
									<p className="text-sm text-muted-foreground">None yet.</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{(projectDetailQuery.data?.fgacDocTypes.custom ?? []).map((t) => (
											<div
												key={t}
												className="flex items-center gap-1 rounded-full border border-border/80 bg-muted/20 py-0.5 pl-2.5 pr-1"
											>
												<span className="font-mono text-xs">{t}</span>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 w-7 shrink-0 p-0 text-destructive hover:bg-destructive/10"
													disabled={removeFgacDocTypeMut.isPending}
													onClick={() => removeFgacDocTypeMut.mutate(t)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										))}
									</div>
								)}
							</div>
							{docTypeActionError ? <p className="text-sm text-destructive">{docTypeActionError}</p> : null}
						</CardContent>
					</Card>
					{schemaActionError ? <p className="text-sm text-destructive">{schemaActionError}</p> : null}
					{docTypesForUi.map((type) => {
						const q = schemaQueries.byType.get(type);
						const rels = q?.data?.relations ?? {};
						return (
							<Card key={type} className="overflow-hidden border-border/70 shadow-sm">
								<CardHeader className="border-b border-border/50 bg-secondary/10 pb-4">
									<div className="flex items-center gap-2">
										<Shield className="size-5 text-primary" strokeWidth={1.5} />
										<CardTitle className="font-display text-lg">{docTypeLabel(type)}</CardTitle>
									</div>
									<CardDescription>Relation definitions for <span className="font-mono">{type}</span> documents.</CardDescription>
								</CardHeader>
								<CardContent className="p-0">
									{!q ? (
										<p className="p-4 text-sm text-muted-foreground">Loading…</p>
									) : q.isLoading ? (
										<p className="p-4 text-sm text-muted-foreground">Loading…</p>
									) : q.isError ? (
										<p className="p-4 text-sm text-destructive">
											{q.error instanceof Error ? q.error.message : 'Failed to load schema'}
										</p>
									) : Object.keys(rels).length === 0 ? (
										<p className="p-4 text-sm text-muted-foreground">No relations defined.</p>
									) : (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[140px]">Relation</TableHead>
													<TableHead>Permissions</TableHead>
													<TableHead className="w-[200px]">Inherits</TableHead>
													<TableHead className="w-[120px] text-right">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{Object.entries(rels).map(([name, meta]) => (
													<TableRow key={name}>
														<TableCell className="font-mono text-sm font-medium">{name}</TableCell>
														<TableCell>
															<ChipList items={meta.permissions} />
														</TableCell>
														<TableCell>
															<ChipList items={meta.inherits} />
														</TableCell>
														<TableCell className="text-right">
															<div className="flex justify-end gap-1">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	className="h-8 px-2"
																	onClick={() => {
																		setAdvType(type);
																		setAdvRelationName(name);
																		setAdvPerms([...meta.permissions]);
																		setAdvInherits([...meta.inherits]);
																		setTab('advanced');
																	}}
																>
																	<Pencil className="size-3.5" />
																</Button>
																{isBuiltinFgacRelation(name) ? null : (
																	<Button
																		type="button"
																		variant="ghost"
																		size="sm"
																		className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
																		disabled={deleteSchemaRelationMut.isPending}
																		onClick={() => {
																			if (
																				!globalThis.confirm(
																					`Delete relation "${name}" for ${type}? Existing grants are not removed automatically.`,
																				)
																			) {
																				return;
																			}
																			deleteSchemaRelationMut.mutate({ docType: type, relation: name });
																		}}
																	>
																		<Trash2 className="size-3.5" />
																	</Button>
																)}
															</div>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			) : null}

			{tab === 'grants' ? (
				<div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,320px)]">
					<Card className="border-border/70 border-l-[3px] border-l-primary/45 shadow-sm">
						<CardHeader className="space-y-1.5 pb-4">
							<p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/90">
								Access ledger
							</p>
							<CardTitle className="font-display text-xl tracking-tight">Grant or revoke</CardTitle>
							<CardDescription className="leading-relaxed">
								Choose subject, resource type, then a relation that is{' '}
								<span className="font-medium text-foreground">defined for that type</span> in the schema (the API
								rejects undefined pairs). Project uses this workspace id automatically.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant={subjectMode === 'user' ? 'default' : 'outline'}
									onClick={() => setSubjectMode('user')}
								>
									User
								</Button>
								<Button
									type="button"
									size="sm"
									variant={subjectMode === 'group' ? 'default' : 'outline'}
									onClick={() => setSubjectMode('group')}
								>
									Group
								</Button>
							</div>

							{subjectMode === 'user' ? (
								<div className="space-y-2">
									<Label>Find member</Label>
									<div className="relative">
										<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											className="pl-9"
											placeholder="Search by email, name, or user id…"
											value={userPickQuery}
											onChange={(e) => setUserPickQuery(e.target.value)}
										/>
									</div>
									<div className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/10">
										{filteredMembers.map((m) => (
											<button
												type="button"
												key={m.userId}
												onClick={() => {
													setGrantUserId(m.userId);
													setUserPickQuery(m.user?.email ?? m.userId);
												}}
												className={cn(
													'flex w-full flex-col items-start border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-secondary/50',
													grantUserId === m.userId && 'bg-primary/10',
												)}
											>
												<span className="font-medium">{m.user?.email ?? m.userId}</span>
												{m.user?.name ? <span className="text-xs text-muted-foreground">{m.user.name}</span> : null}
												<span className="font-mono text-[10px] text-muted-foreground">{m.userId}</span>
											</button>
										))}
									</div>
									{grantUserId ? (
										<p className="font-mono text-xs text-muted-foreground">
											Subject: <span className="text-foreground">user:{grantUserId}</span>
										</p>
									) : null}
								</div>
							) : (
								<div className="space-y-2">
									<Label>Find group</Label>
									<div className="relative">
										<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											className="pl-9"
											placeholder="Search by group name…"
											value={grantGroupSearchQuery}
											onChange={(e) => setGrantGroupSearchQuery(e.target.value)}
										/>
									</div>
									<div className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/10">
										{groupsQuery.isLoading ? (
											<p className="px-3 py-2 text-sm text-muted-foreground">Loading groups…</p>
										) : filteredGrantGroups.length === 0 ? (
											<p className="px-3 py-2 text-sm text-muted-foreground">
												{grantGroupSearchQuery.trim()
													? 'No match. Try another search or use the field below.'
													: 'No groups yet. Add members on the Groups tab, or enter a name below.'}
											</p>
										) : (
											filteredGrantGroups.map((g) => (
												<button
													type="button"
													key={g}
													onClick={() => {
														setGrantGroupSelected(g);
														setGrantGroupSearchQuery(g);
														setGrantGroupManual('');
													}}
													className={cn(
														'flex w-full flex-col items-start border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-secondary/50',
														grantGroupSelected === g &&
															!grantGroupManual.trim() &&
															'bg-primary/10',
													)}
												>
													<span className="font-mono text-sm font-medium">{g}</span>
												</button>
											))
										)}
									</div>
									<div className="space-y-1.5">
										<Label htmlFor="grant-group-manual">Or enter group name</Label>
										<Input
											id="grant-group-manual"
											placeholder="If not listed (e.g. before any member is added)"
											value={grantGroupManual}
											onChange={(e) => {
												const v = e.target.value;
												setGrantGroupManual(v);
												if (v.trim()) setGrantGroupSelected(null);
											}}
										/>
									</div>
									{effectiveGrantGroup ? (
										<p className="font-mono text-xs text-muted-foreground">
											Subject: <span className="text-foreground">group:{effectiveGrantGroup}</span>
										</p>
									) : null}
								</div>
							)}

							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label>Resource type</Label>
									<select
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
										value={grantResourceType}
										onChange={(e) => setGrantResourceType(e.target.value as FgacDocType)}
									>
										{docTypesForUi.map((t) => (
											<option key={t} value={t}>
												{docTypeLabel(t)}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1.5">
									<Label>Relation</Label>
									<select
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
										disabled={
											grantRelationNamesForResourceType === null ||
											grantRelationNamesForResourceType.length === 0
										}
										value={
											grantRelationNamesForResourceType?.includes(pickedRelation)
												? pickedRelation
												: (grantRelationNamesForResourceType?.[0] ?? '')
										}
										onChange={(e) => setPickedRelation(e.target.value)}
									>
										{grantRelationNamesForResourceType === null ? (
											<option value="">Loading schema…</option>
										) : grantRelationNamesForResourceType.length === 0 ? (
											<option value="">No relations for this type</option>
										) : (
											grantRelationNamesForResourceType.map((r) => (
												<option key={r} value={r}>
													{r}
												</option>
											))
										)}
									</select>
								</div>
							</div>

							{grantRelationNamesForResourceType !== null &&
							grantRelationNamesForResourceType.length === 0 ? (
								<p className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
									Define at least one relation for{' '}
									<span className="font-mono text-foreground">{grantResourceType}</span> under{' '}
									<span className="font-medium text-foreground">Schema</span> or{' '}
									<span className="font-medium text-foreground">Advanced</span> before granting on this type.
								</p>
							) : null}

							<div className="space-y-3 rounded-xl border border-border/60 bg-gradient-to-br from-secondary/25 via-card to-card p-4 shadow-sm">
								<div className="flex items-center gap-2 text-primary">
									<Clock className="size-4 shrink-0" strokeWidth={2} />
									<span className="font-display text-sm font-semibold tracking-tight text-foreground">
										Access duration
									</span>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										size="sm"
										variant={!grantExpiryLimited ? 'default' : 'outline'}
										className={cn(!grantExpiryLimited && 'shadow-sm')}
										onClick={() => {
											setGrantExpiryLimited(false);
											setGrantExpiryAtLocal('');
										}}
									>
										Until revoked
									</Button>
									<Button
										type="button"
										size="sm"
										variant={grantExpiryLimited ? 'default' : 'outline'}
										className={cn(grantExpiryLimited && 'shadow-sm')}
										onClick={() => {
											setGrantExpiryLimited(true);
											setGrantExpiryAtLocal((v) => (v.trim().length > 0 ? v : defaultGrantExpiryLocalValue()));
										}}
									>
										Expires on…
									</Button>
								</div>
								{grantExpiryLimited ? (
									<div className="animate-rise-in space-y-1.5">
										<Label htmlFor="grant-expires-at">Until (local)</Label>
										<Input
											id="grant-expires-at"
											type="datetime-local"
											className="font-mono text-sm"
											value={grantExpiryAtLocal}
											onChange={(e) => setGrantExpiryAtLocal(e.target.value)}
										/>
										<p className="text-xs leading-relaxed text-muted-foreground">
											After this instant the grant is ignored until you issue a new one. Choose a future time; revoke
											early if you need to cut access sooner.
										</p>
									</div>
								) : (
									<p className="text-xs leading-relaxed text-muted-foreground">
										No <span className="font-mono text-foreground/85">expires_at</span> is stored — the tuple stays
										effective until you revoke it here or via the API.
									</p>
								)}
							</div>

							<div className="space-y-1.5">
								<Label>Resource</Label>
								{grantResourceType === 'project' ? (
									<p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 font-mono text-xs">
										{projectDetailQuery.isLoading
											? 'Loading project…'
											: projectId
												? `${projectDetailQuery.data?.name ?? slug} — ${projectId}`
												: 'Unavailable'}
									</p>
								) : grantResourceType === 'client' ? (
									<select
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
										value={grantResourceId}
										onChange={(e) => setGrantResourceId(e.target.value)}
									>
										<option value="">Select client…</option>
										{(clientsQuery.data ?? []).map((c) => (
											<option key={c.id} value={c.id}>
												{c.name} ({c.clientId})
											</option>
										))}
									</select>
								) : grantResourceType === 'scope_set' ? (
									<select
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
										value={grantResourceId}
										onChange={(e) => setGrantResourceId(e.target.value)}
									>
										<option value="">Select scope set…</option>
										{(scopeSetsQuery.data ?? []).map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
									</select>
								) : grantResourceType === 'user' ? (
									<>
										<div className="relative">
											<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												className="pl-9"
												placeholder="Search member to target as user resource…"
												value={grantResourceUserQuery}
												onChange={(e) => setGrantResourceUserQuery(e.target.value)}
											/>
										</div>
										<div className="max-h-36 overflow-auto rounded-lg border border-border/60">
											{filteredResourceMembers.map((m) => (
												<button
													type="button"
													key={m.userId}
													onClick={() => setGrantResourceId(m.userId)}
													className={cn(
														'block w-full border-b border-border/40 px-3 py-2 text-left text-sm hover:bg-secondary/50',
														grantResourceId === m.userId && 'bg-accent/15',
													)}
												>
													{m.user?.email ?? m.userId}
												</button>
											))}
										</div>
									</>
								) : (
									<div className="space-y-1.5">
										<Input
											className="font-mono text-sm"
											placeholder="Resource id (UUID, slug, or stable key from your app)"
											value={grantResourceId}
											onChange={(e) => setGrantResourceId(e.target.value)}
										/>
										<p className="text-xs text-muted-foreground">
											Custom doc type <span className="font-mono text-foreground/90">{grantResourceType}</span> — enter
											the same <span className="font-mono">id</span> your API uses when checking permissions.
										</p>
									</div>
								)}
							</div>

							<div className="flex flex-wrap gap-2">
								<Button
									disabled={
										grantMut.isPending ||
										!grantResourceId ||
										grantRelationNamesForResourceType === null ||
										grantRelationNamesForResourceType.length === 0 ||
										(subjectMode === 'user' && !grantUserId) ||
										(subjectMode === 'group' && !effectiveGrantGroup) ||
										(grantExpiryLimited && !grantExpiryAtLocal.trim())
									}
									onClick={() => grantMut.mutate()}
								>
									Grant
								</Button>
								<Button
									variant="outline"
									disabled={
										revokeMut.isPending ||
										!grantResourceId ||
										grantRelationNamesForResourceType === null ||
										grantRelationNamesForResourceType.length === 0 ||
										(subjectMode === 'user' && !grantUserId) ||
										(subjectMode === 'group' && !effectiveGrantGroup)
									}
									onClick={() => revokeMut.mutate()}
								>
									Revoke
								</Button>
							</div>
							{grantError ? <p className="text-sm text-destructive">{grantError}</p> : null}
						</CardContent>
					</Card>

					<Card className="h-fit border-border/60 border-l-[3px] border-l-accent/50 bg-gradient-to-b from-secondary/30 to-card/90 shadow-sm">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 font-display text-base tracking-tight">
								<BookOpen className="size-4 text-primary" strokeWidth={2} />
								How it fits
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<p>
								<span className="font-medium text-foreground">Schema</span> defines each relation per{' '}
								<span className="font-mono text-xs">doc type</span> (permissions + inheritance). Grants only succeed when
								that pair exists.
							</p>
							<p>
								<span className="font-medium text-foreground">Grants</span> attach a subject to one resource row (project
								id, client id, custom id, etc.) with a relation allowed for that row&apos;s type. Optional{' '}
								<span className="font-mono text-xs">expiresAt</span> (ms since epoch) ends access automatically; otherwise
								revoke when done.
							</p>
							<p>
								<span className="font-medium text-foreground">Groups</span> are named sets of user ids; grant{' '}
								<span className="font-mono text-xs">group:name</span> like a user to reuse access.
							</p>
							<p>
								<Link
									to="/projects/$slug/access"
									params={{ slug }}
									className="font-medium text-primary underline-offset-4 hover:underline"
								>
									Access overview
								</Link>{' '}
								lists effective tuples across members.
							</p>
						</CardContent>
					</Card>
				</div>
			) : null}

			{tab === 'groups' ? (
				<div className="grid gap-6 lg:grid-cols-[280px_1fr]">
					<Card className="border-border/70">
						<CardHeader className="pb-2">
							<CardTitle className="flex items-center gap-2 font-display text-lg">
								<UsersRound className="size-5" />
								Groups
							</CardTitle>
							<div className="relative mt-2">
								<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="h-9 pl-8 text-sm"
									placeholder="Filter…"
									value={groupPickQuery}
									onChange={(e) => setGroupPickQuery(e.target.value)}
								/>
							</div>
						</CardHeader>
						<CardContent className="max-h-[420px] space-y-1 overflow-auto p-2">
							{(filteredGroups.length ? filteredGroups : groupsQuery.data?.groups ?? []).map((g) => (
								<button
									type="button"
									key={g}
									onClick={() => setSelectedGroup(g)}
									className={cn(
										'w-full rounded-lg px-3 py-2 text-left font-mono text-sm hover:bg-secondary/60',
										selectedGroup === g && 'bg-primary/15 font-medium text-foreground',
									)}
								>
									{g}
								</button>
							))}
							{!groupsQuery.isLoading && (groupsQuery.data?.groups.length ?? 0) === 0 ? (
								<p className="p-2 text-sm text-muted-foreground">No groups yet. Add a member below to create one.</p>
							) : null}
						</CardContent>
					</Card>

					<div className="space-y-4">
						<Card className="border-border/70">
							<CardHeader>
								<CardTitle className="font-display text-lg">{selectedGroup ?? 'Select a group'}</CardTitle>
								<CardDescription>Members are raw user ids in FGAC; we resolve emails from project members when possible.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{selectedGroup ? (
									<>
										<div>
											<h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Members</h4>
											{groupMembersQuery.isLoading ? (
												<p className="text-sm text-muted-foreground">Loading…</p>
											) : (
												<ul className="space-y-2">
													{(groupMembersQuery.data?.users ?? []).map((uid) => (
														<li
															key={uid}
															className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 px-3 py-2"
														>
															<div>
																<p className="text-sm font-medium">{memberById.get(uid)?.email ?? uid}</p>
																<p className="font-mono text-[10px] text-muted-foreground">{uid}</p>
															</div>
															<Button
																type="button"
																size="sm"
																variant="ghost"
																className="text-destructive hover:text-destructive"
																onClick={() => removeGroupMut.mutate({ userId: uid, group: selectedGroup })}
																disabled={removeGroupMut.isPending}
															>
																<Trash2 className="size-4" />
															</Button>
														</li>
													))}
												</ul>
											)}
										</div>
										<div>
											<h4 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
												<GitBranch className="size-3.5" />
												Group → resource relations
											</h4>
											{groupRelationsQuery.isLoading ? (
												<p className="text-sm text-muted-foreground">Loading…</p>
											) : groupRelationsFlat.length === 0 ? (
												<p className="text-sm text-muted-foreground">No relations stored for this group.</p>
											) : (
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Relation</TableHead>
															<TableHead>Resource</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{groupRelationsFlat.map((r, idx) => (
															<TableRow key={`${r.type}-${r.id}-${r.relation}-${idx}`}>
																<TableCell className="font-mono text-sm">{r.relation}</TableCell>
																<TableCell>
																	<span className="font-mono text-xs text-muted-foreground">{r.type}</span>{' '}
																	<span className="text-sm">{resolveLabel(r.type as FgacDocType, r.id)}</span>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											)}
										</div>
									</>
								) : (
									<p className="text-sm text-muted-foreground">Choose a group on the left.</p>
								)}
							</CardContent>
						</Card>

						<Card className="border-dashed border-primary/25 bg-primary/[0.03]">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 font-display text-base">
									<UserPlus className="size-4" />
									Add member to group
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-1.5">
										<Label>Group</Label>
										<Input
											placeholder="Group name"
											value={newGroupName}
											onChange={(e) => setNewGroupName(e.target.value)}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label>Pick user</Label>
									<div className="relative">
										<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											className="pl-9"
											placeholder="Search…"
											value={addToGroupUserQuery}
											onChange={(e) => setAddToGroupUserQuery(e.target.value)}
										/>
									</div>
									<div className="max-h-36 overflow-auto rounded-lg border border-border/60">
										{addGroupCandidates.map((m) => (
											<button
												type="button"
												key={m.userId}
												onClick={() => {
													const g = newGroupName.trim() || selectedGroup;
													if (!g) {
														setGroupActionError('Enter or select a group name');
														return;
													}
													addGroupMut.mutate({ userId: m.userId, group: g });
													setSelectedGroup(g);
													setNewGroupName(g);
												}}
												className="block w-full border-b border-border/40 px-3 py-2 text-left text-sm hover:bg-secondary/50"
											>
												{m.user?.email ?? m.userId}
											</button>
										))}
									</div>
								</div>
								{groupActionError ? <p className="text-sm text-destructive">{groupActionError}</p> : null}
							</CardContent>
						</Card>
					</div>
				</div>
			) : null}

			{tab === 'inspector' ? (
				<div className="space-y-6">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="font-display text-lg">Effective grants by resource type</CardTitle>
							<CardDescription>Loads FGAC tuples for this user across project, client, scope_set, and user resources.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="relative max-w-md">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									placeholder="Search members…"
									value={inspectorUserQuery}
									onChange={(e) => setInspectorUserQuery(e.target.value)}
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								{inspectorCandidates.map((m) => (
									<Button
										type="button"
										key={m.userId}
										size="sm"
										variant={selectedInspectorUserId === m.userId ? 'default' : 'outline'}
										onClick={() => setSelectedInspectorUserId(m.userId)}
									>
										{m.user?.email ?? m.userId.slice(0, 8)}
									</Button>
								))}
							</div>
						</CardContent>
					</Card>

					{selectedInspectorUserId ? (
						<div className="grid gap-4 md:grid-cols-2">
							{docTypesForUi.map((type, i) => {
								const q = userRelQueries[i];
								const rows = q.data?.relations ?? [];
								return (
									<Card key={type} className="border-border/60">
										<CardHeader className="py-3">
											<div className="flex items-center gap-2">
												<Boxes className="size-4 text-primary" />
												<CardTitle className="font-display text-base">{docTypeLabel(type)}</CardTitle>
											</div>
										</CardHeader>
										<CardContent className="p-0">
											{q.isLoading ? (
												<p className="p-4 text-sm text-muted-foreground">Loading…</p>
											) : rows.length === 0 ? (
												<p className="p-4 text-sm text-muted-foreground">No tuples.</p>
											) : (
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Relation</TableHead>
															<TableHead>On</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{rows.map((row, idx) => (
															<TableRow key={`${row.id}-${row.relation}-${idx}`}>
																<TableCell className="font-mono text-sm">{row.relation}</TableCell>
																<TableCell>
																	<p className="text-sm">{resolveLabel(type, row.id)}</p>
																	<p className="font-mono text-[10px] text-muted-foreground">{row.id}</p>
																	{row.expires_at ? (
																		<p className="text-[10px] text-muted-foreground">
																			expires {new Date(row.expires_at).toLocaleString()}
																		</p>
																	) : null}
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											)}
										</CardContent>
									</Card>
								);
							})}
						</div>
					) : null}

					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="font-display text-lg">Your session on a resource</CardTitle>
							<CardDescription>Resolved permissions for the logged-in admin (not the inspected user).</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-3 sm:grid-cols-3">
								<div className="space-y-1.5 sm:col-span-1">
									<Label>Type</Label>
									<select
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
										value={simResourceType}
										onChange={(e) => {
											const t = e.target.value as FgacDocType;
											setSimResourceType(t);
											if (t === 'project' && projectId) {
												setSimResourceId(projectId);
											} else {
												setSimResourceId('');
											}
										}}
									>
										{docTypesForUi.map((t) => (
											<option key={t} value={t}>
												{docTypeLabel(t)}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-1.5 sm:col-span-2">
									<Label>Resource id</Label>
									{simResourceType === 'project' && projectId ? (
										<Input readOnly value={projectId} className="font-mono text-xs" />
									) : simResourceType === 'client' ? (
										<select
											className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
											value={simResourceId}
											onChange={(e) => setSimResourceId(e.target.value)}
										>
											<option value="">Select…</option>
											{(clientsQuery.data ?? []).map((c) => (
												<option key={c.id} value={c.id}>
													{c.name}
												</option>
											))}
										</select>
									) : simResourceType === 'scope_set' ? (
										<select
											className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
											value={simResourceId}
											onChange={(e) => setSimResourceId(e.target.value)}
										>
											<option value="">Select…</option>
											{(scopeSetsQuery.data ?? []).map((s) => (
												<option key={s.id} value={s.id}>
													{s.name}
												</option>
											))}
										</select>
									) : (
										<Input
											className="font-mono text-xs"
											placeholder="User resource id"
											value={simResourceId}
											onChange={(e) => setSimResourceId(e.target.value)}
										/>
									)}
								</div>
							</div>
							<Button
								type="button"
								variant="secondary"
								disabled={simMut.isPending || !simResourceId}
								onClick={() => simMut.mutate()}
							>
								Resolve my access
							</Button>
							{simMut.data ? (
								<div className="grid gap-4 sm:grid-cols-2">
									<div>
										<p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Permissions</p>
										<ChipList items={simMut.data.permissions} />
									</div>
									<div>
										<p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Relations</p>
										<ChipList items={simMut.data.relations} />
									</div>
								</div>
							) : null}
						</CardContent>
					</Card>
				</div>
			) : null}

			{tab === 'advanced' ? (
				<div className="grid gap-6 lg:grid-cols-2">
					<Card className="border-border/70">
						<CardHeader>
							<CardTitle className="font-display text-lg">Define or update relation</CardTitle>
							<CardDescription>
								Creates or overwrites a relation for one document type. Use Schema → edit to load an existing row here.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-1.5">
								<Label>Document type</Label>
								<select
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
									value={advType}
									onChange={(e) => setAdvType(e.target.value as FgacDocType)}
								>
									{docTypesForUi.map((t) => (
										<option key={t} value={t}>
											{docTypeLabel(t)}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-1.5">
								<Label>Relation name</Label>
								<Input value={advRelationName} onChange={(e) => setAdvRelationName(e.target.value)} placeholder="custom_role" />
							</div>
							<div className="space-y-2">
								<Label>Permissions</Label>
								<div className="flex flex-wrap gap-2">
									{FGAC_PERMISSION_NAMES.map((p) => (
										<label key={p} className="flex items-center gap-1.5 text-sm">
											<input
												type="checkbox"
												checked={advPerms.includes(p)}
												onChange={() => {
													setAdvPerms((prev) =>
														prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
													);
												}}
											/>
											<span className="font-mono text-xs">{p}</span>
										</label>
									))}
								</div>
							</div>
							<div className="space-y-1.5">
								<Label>Inherits (optional)</Label>
								<select
									multiple
									className="min-h-[100px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
									value={advInherits}
									onChange={(e) => {
										const v = Array.from(e.target.selectedOptions).map((o) => o.value);
										setAdvInherits(v);
									}}
								>
									{advRelationNames.map((r) => (
										<option key={r} value={r}>
											{r}
										</option>
									))}
								</select>
							</div>
							<Button
								disabled={defineMut.isPending || !advRelationName.trim() || advPerms.length === 0}
								onClick={() => defineMut.mutate()}
							>
								Save relation
							</Button>
						</CardContent>
					</Card>

					<Card className="border-destructive/20 bg-destructive/[0.03]">
						<CardHeader>
							<CardTitle className="font-display text-lg text-destructive">Delete relation</CardTitle>
							<CardDescription>Removes a relation definition for the selected document type.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-1.5">
								<Label>Document type</Label>
								<select
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
									value={advType}
									onChange={(e) => setAdvType(e.target.value as FgacDocType)}
								>
									{docTypesForUi.map((t) => (
										<option key={t} value={t}>
											{docTypeLabel(t)}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-1.5">
								<Label>Relation</Label>
								<select
									className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
									value={delRelation}
									onChange={(e) => setDelRelation(e.target.value)}
								>
									<option value="">Select…</option>
									{advRelationNames.map((r) => (
										<option key={r} value={r}>
											{r}
										</option>
									))}
								</select>
							</div>
							<Button
								variant="outline"
								className="border-destructive/50 text-destructive hover:bg-destructive/10"
								disabled={deleteMut.isPending || !delRelation}
								onClick={() => deleteMut.mutate()}
							>
								Delete relation
							</Button>
							{advError ? <p className="text-sm text-destructive">{advError}</p> : null}
						</CardContent>
					</Card>
				</div>
			) : null}
		</div>
	);
}
