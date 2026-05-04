import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Activity,
	Ban,
	CalendarClock,
	CheckCircle2,
	Clock3,
	Fingerprint,
	FolderKanban,
	KeyRound,
	Laptop,
	PenLine,
	Search,
	ShieldCheck,
	Smartphone,
	Trash2,
	UserCircle,
	Wifi,
} from 'lucide-react';
import {
	revokeAdminUserSession,
	updateAdminUser,
	type AdminDeviceInfo,
	type AdminUserProjectTokenSession,
	type AdminUserRow,
	type AdminUserSession,
} from '@/lib/api';
import { useAdminUsersQuery, useProjectsQuery } from '@/hooks/use-oidc-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAdminStore } from '@/stores/admin-store';
import { cn } from '@/lib/utils';

function formatDt(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function empty(value: string | null | undefined): string {
	return value && value.trim().length > 0 ? value : '—';
}

function shortId(value: string): string {
	return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function sessionLabel(session: AdminUserSession): string {
	if (session.device?.deviceModel) return session.device.deviceModel;
	if (session.device?.osName) return session.device.osName;
	return session.deviceId.startsWith('admin-web:') ? 'Admin web session' : 'Unknown device';
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string | null | undefined }) {
	return (
		<div className="min-w-0 border-b border-border/60 py-2 last:border-0">
			<p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
			<p className="mt-1 break-words font-mono text-xs text-foreground">{empty(value)}</p>
		</div>
	);
}

function Metric({
	icon: Icon,
	label,
	value,
	tone = 'default',
}: {
	readonly icon: typeof UserCircle;
	readonly label: string;
	readonly value: number;
	readonly tone?: 'default' | 'danger' | 'good';
}) {
	return (
		<div
			className={cn(
				'rounded-lg border bg-card/80 p-4 shadow-sm',
				tone === 'danger' && 'border-destructive/30 bg-destructive/5',
				tone === 'good' && 'border-primary/25 bg-primary/5',
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
				<Icon className="h-4 w-4 text-primary" aria-hidden="true" />
			</div>
			<p className="mt-3 font-display text-3xl leading-none">{value}</p>
		</div>
	);
}

function UserStatusBadge({ user }: { readonly user: AdminUserRow }) {
	if (user.isBanned) {
		return <Badge className="border-destructive/60 bg-destructive/15 text-destructive">Banned</Badge>;
	}
	return <Badge className="border-primary/30 bg-primary/10 text-primary">Active</Badge>;
}

function DeviceDetails({ device }: { readonly device: AdminDeviceInfo | null }) {
	if (!device) {
		return (
			<div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4">
				<p className="text-sm font-medium text-foreground">No registered device record</p>
				<p className="mt-1 text-xs text-muted-foreground">
					This is usually an admin web session or an older session without a device row.
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			<InfoRow label="Device ID" value={device.id} />
			<InfoRow label="Fingerprint" value={device.fingerprint} />
			<InfoRow label="Type" value={device.deviceType} />
			<InfoRow label="Model" value={device.deviceModel} />
			<InfoRow label="OS" value={[device.osName, device.osVersion].filter(Boolean).join(' ') || null} />
			<InfoRow label="Physical" value={device.isPhysicalDevice} />
			<InfoRow label="App version" value={device.appVersion} />
			<InfoRow label="IP address" value={device.ipAddress} />
			<InfoRow label="City" value={device.city} />
			<InfoRow label="Country" value={device.countryCode} />
			<InfoRow label="ISP" value={device.isp} />
			<InfoRow label="Colo" value={device.colo} />
			<InfoRow label="Timezone" value={device.timezone} />
			<InfoRow label="Longitude" value={device.longitude} />
			<InfoRow label="Latitude" value={device.latitude} />
			<InfoRow label="FCM token" value={device.fcmToken} />
			<InfoRow label="Device created" value={formatDt(device.createdAt)} />
			<InfoRow label="Device updated" value={formatDt(device.updatedAt)} />
		</div>
	);
}

function SessionRow({
	session,
	memberships,
	canRevoke,
	isRevoking,
	onRevoke,
}: {
	readonly session: AdminUserSession;
	readonly memberships: AdminUserRow['memberships'];
	readonly canRevoke: boolean;
	readonly isRevoking: boolean;
	readonly onRevoke: (session: AdminUserSession) => void;
}) {
	const DeviceIcon = session.device?.deviceType?.toLowerCase().includes('phone') ? Smartphone : Laptop;

	return (
		<div className="rounded-lg border border-border/70 bg-background/55 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<DeviceIcon className="h-4 w-4 text-primary" aria-hidden="true" />
						<p className="font-semibold text-foreground">{sessionLabel(session)}</p>
						{session.isActive ? (
							<Badge className="border-primary/30 bg-primary/10 text-primary">Active session</Badge>
						) : (
							<Badge variant="outline">Expired</Badge>
						)}
						{session.isTrusted ? <Badge variant="secondary">Trusted</Badge> : null}
						<Badge variant="outline" className="normal-case tracking-normal">
							Global account session
						</Badge>
					</div>
					<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
						{shortId(session.id)} / {shortId(session.deviceId)}
					</p>
					<div className="mt-2 flex flex-wrap gap-1">
						{memberships.slice(0, 4).map((membership) => (
							<Badge key={membership.id} variant="outline" className="normal-case tracking-normal">
								usable for {membership.projectSlug}
							</Badge>
						))}
						{memberships.length > 4 ? (
							<Badge variant="outline" className="normal-case tracking-normal">
								+{memberships.length - 4} projects
							</Badge>
						) : null}
					</div>
				</div>
				<div className="grid min-w-[220px] gap-1 text-xs text-muted-foreground">
					<span>Last refresh: {formatDt(session.lastRefresh)}</span>
					<span>Active until: {formatDt(session.activeUntil)}</span>
					<span>Trusted at: {formatDt(session.trustedAt)}</span>
					<Button
						size="sm"
						variant="outline"
						className="mt-2 w-fit border-destructive/60 text-destructive hover:bg-destructive/10"
						disabled={!canRevoke || isRevoking}
						onClick={() => onRevoke(session)}
					>
						<Trash2 className="mr-2 h-3.5 w-3.5" />
						Revoke
					</Button>
				</div>
			</div>
			<div className="mt-4">
				<DeviceDetails device={session.device} />
			</div>
		</div>
	);
}

function ProjectTokenSessionRow({ session }: { readonly session: AdminUserProjectTokenSession }) {
	return (
		<div className="rounded-lg border border-border/70 bg-card/70 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
						<p className="font-semibold text-foreground">{session.projectName}</p>
						{session.isActive ? (
							<Badge className="border-primary/30 bg-primary/10 text-primary">Active token</Badge>
						) : (
							<Badge variant="outline">Inactive token</Badge>
						)}
						<Badge variant="secondary">{session.clientName ?? session.clientId}</Badge>
					</div>
					<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
						{session.projectSlug} / client:{session.clientId} / token:{shortId(session.id)}
					</p>
					<div className="mt-3 flex flex-wrap gap-1">
						{session.scope.split(/\s+/).filter(Boolean).map((scope) => (
							<Badge key={scope} variant="outline" className="normal-case tracking-normal">
								{scope}
							</Badge>
						))}
					</div>
				</div>
				<div className="grid min-w-[220px] gap-1 text-xs text-muted-foreground">
					<span>Issued: {formatDt(session.createdAt)}</span>
					<span>Expires: {formatDt(session.expiresAt)}</span>
					<span>Revoked: {formatDt(session.revokedAt)}</span>
				</div>
			</div>
		</div>
	);
}

export function UsersPage() {
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const sessionUser = useAdminStore((state) => state.sessionUser);
	const storedProjectSlug = useAdminStore((state) => state.selectedProjectSlug);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const [projectFilterSlug, setProjectFilterSlug] = useState<string>(() => storedProjectSlug ?? 'all');
	const effectiveProjectSlug = projectFilterSlug === 'all' ? null : projectFilterSlug;
	const projectsQuery = useProjectsQuery();
	const usersQuery = useAdminUsersQuery(effectiveProjectSlug);
	const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [nameDraft, setNameDraft] = useState('');
	const [banUserId, setBanUserId] = useState<string | null>(null);
	const [banReason, setBanReason] = useState('');
	const [banUntil, setBanUntil] = useState('');
	const [banDateError, setBanDateError] = useState<string | null>(null);

	const sortedUsers = useMemo(() => {
		const data = usersQuery.data;
		if (!data) return [];
		return [...data].sort((a, b) => a.email.localeCompare(b.email));
	}, [usersQuery.data]);

	useEffect(() => {
		if (!projectsQuery.data || projectFilterSlug === 'all') {
			return;
		}
		if (!projectsQuery.data.some((project) => project.slug === projectFilterSlug)) {
			setProjectFilterSlug('all');
		}
	}, [projectFilterSlug, projectsQuery.data]);

	useEffect(() => {
		if (sortedUsers.length === 0) {
			setSelectedUserId(null);
			return;
		}
		if (!selectedUserId || !sortedUsers.some((user) => user.id === selectedUserId)) {
			setSelectedUserId(sortedUsers[0]?.id ?? null);
		}
	}, [selectedUserId, sortedUsers]);

	const filteredUsers = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return sortedUsers;
		return sortedUsers.filter((user) => {
			const sessionText = user.sessions
				.flatMap((session) => [
					session.id,
					session.deviceId,
					session.device?.id,
					session.device?.fingerprint,
					session.device?.deviceModel,
					session.device?.osName,
					session.device?.ipAddress,
					session.device?.city,
					session.device?.countryCode,
				])
				.filter(Boolean)
				.join(' ');
			const projectSessionText = user.projectSessions
				.flatMap((session) => [
					session.id,
					session.projectSlug,
					session.projectName,
					session.clientId,
					session.clientName,
					session.scope,
				])
				.filter(Boolean)
				.join(' ');
			const membershipText = user.memberships
				.flatMap((membership) => [
					membership.projectId,
					membership.projectSlug,
					membership.projectName,
					membership.role,
				])
				.filter(Boolean)
				.join(' ');
			return [
				user.id,
				user.email,
				user.name,
				user.phoneNumber,
				user.avatarUrl,
				user.banReason,
				membershipText,
				sessionText,
				projectSessionText,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(term);
		});
	}, [search, sortedUsers]);

	const selectedUser = sortedUsers.find((user) => user.id === selectedUserId) ?? filteredUsers[0] ?? null;
	const manageableProjectSlugs = useMemo(() => {
		return new Set(
			(projectsQuery.data ?? [])
				.filter((project) => project.role === undefined || project.role === 'admin' || project.role === 'owner')
				.map((project) => project.slug),
		);
	}, [projectsQuery.data]);
	const canRevokeSelectedUserSessions =
		selectedUser !== null &&
		selectedUser.id !== sessionUser?.id &&
		selectedUser.memberships.some((membership) => manageableProjectSlugs.has(membership.projectSlug));
	const activeSessions = sortedUsers.reduce(
		(total, user) => total + user.sessions.filter((session) => session.isActive).length,
		0,
	);
	const activeProjectSessions = sortedUsers.reduce(
		(total, user) => total + user.projectSessions.filter((session) => session.isActive).length,
		0,
	);
	const trustedSessions = sortedUsers.reduce(
		(total, user) => total + user.sessions.filter((session) => session.isTrusted).length,
		0,
	);
	const knownDevices = sortedUsers.reduce(
		(total, user) => total + user.sessions.filter((session) => session.device !== null).length,
		0,
	);
	const visibleProjectCount = new Set(
		sortedUsers.flatMap((user) => user.memberships.map((membership) => membership.projectId)),
	).size;
	const bannedUsers = sortedUsers.filter((user) => user.isBanned).length;

	const invalidateUsers = async () => {
		await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
	};

	const nameMutation = useMutation({
		mutationFn: async ({ userId, name }: { userId: string; name: string | null }) =>
			updateAdminUser(apiBaseUrl, userId, { name }),
		onSuccess: async () => {
			setEditingId(null);
			await invalidateUsers();
		},
	});

	const banMutation = useMutation({
		mutationFn: async ({
			userId,
			isBanned,
			reason,
			until,
		}: {
			userId: string;
			isBanned: boolean;
			reason?: string | null;
			until?: string | null;
		}) =>
			updateAdminUser(apiBaseUrl, userId, {
				isBanned,
				banReason: isBanned ? reason ?? null : undefined,
				bannedUntil: isBanned ? until ?? null : undefined,
			}),
		onSuccess: async () => {
			setBanUserId(null);
			setBanReason('');
			setBanUntil('');
			await invalidateUsers();
		},
	});

	const sessionRevokeMutation = useMutation({
		mutationFn: async ({ userId, sessionId }: { userId: string; sessionId: string }) =>
			revokeAdminUserSession(apiBaseUrl, userId, sessionId, effectiveProjectSlug),
		onSuccess: async () => {
			await invalidateUsers();
		},
	});

	const listErr =
		usersQuery.error instanceof Error ? usersQuery.error.message : usersQuery.isError ? 'Failed to load users' : null;
	const banTarget = sortedUsers.find((user) => user.id === banUserId) ?? null;
	const sessionRevokeErr =
		sessionRevokeMutation.error instanceof Error
			? sessionRevokeMutation.error.message
			: sessionRevokeMutation.isError
				? 'Session revoke failed'
				: null;

	return (
		<div className="grid gap-4">
			<Card className="overflow-hidden">
				<CardHeader className="access-ledger-hero border-b border-border/70">
					<div className="access-ledger-noise" />
					<div className="relative flex flex-wrap items-start justify-between gap-4">
						<div>
							<CardTitle className="text-2xl">User intelligence</CardTitle>
							<CardDescription className="mt-2 max-w-3xl">
								Project-scoped identity records, ban state, active sessions, trusted devices, and
								every device/network field stored by the OIDC backend.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center justify-end gap-2">
							<div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
								{sessionUser?.email ?? 'System admin'}
							</div>
							<label className="sr-only" htmlFor="user-project-filter">
								Project filter
							</label>
							<select
								id="user-project-filter"
								className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
								value={projectFilterSlug}
								onChange={(event) => {
									const next = event.target.value;
									setProjectFilterSlug(next);
									if (next !== 'all') {
										setSelectedProjectSlug(next);
									}
								}}
							>
								<option value="all">All available projects</option>
								{projectsQuery.data?.map((project) => (
									<option key={project.id} value={project.slug}>
										{project.name}
									</option>
								))}
							</select>
						</div>
					</div>
				</CardHeader>
				<CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
					<Metric icon={UserCircle} label="Users" value={sortedUsers.length} />
					<Metric icon={Activity} label="Account sessions" value={activeSessions} tone="good" />
					<Metric icon={ShieldCheck} label="Trusted sessions" value={trustedSessions} />
					<Metric icon={KeyRound} label="Project tokens" value={activeProjectSessions} />
					<Metric icon={Fingerprint} label="Known devices" value={knownDevices} />
					<Metric icon={FolderKanban} label="Projects" value={visibleProjectCount} />
					<Metric icon={Ban} label="Banned" value={bannedUsers} tone="danger" />
				</CardContent>
			</Card>

			<Card>
				<CardContent className="grid gap-0 p-0 lg:grid-cols-[360px_minmax(0,1fr)]">
					<aside className="border-b border-border/70 p-4 lg:border-b-0 lg:border-r">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								className="pl-9"
								placeholder="Search users, devices, IPs"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<div className="mt-4 max-h-[650px] space-y-2 overflow-auto pr-1">
							{usersQuery.isLoading ? (
								<p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Loading users...</p>
							) : null}
							{listErr ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{listErr}</p> : null}
							{usersQuery.isSuccess && filteredUsers.length === 0 ? (
								<p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">No users found.</p>
							) : null}
							{filteredUsers.map((user) => {
								const activeCount = user.sessions.filter((session) => session.isActive).length;
								return (
									<button
										key={user.id}
										type="button"
										className={cn(
											'w-full rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/5',
											selectedUser?.id === user.id
												? 'border-primary/60 bg-primary/10 shadow-sm'
												: 'border-border/70 bg-background/55',
										)}
										onClick={() => setSelectedUserId(user.id)}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-semibold text-foreground">{user.email}</p>
												<p className="mt-1 truncate text-xs text-muted-foreground">
													{user.name ?? 'Unnamed'} / {shortId(user.id)}
												</p>
											</div>
											<UserStatusBadge user={user} />
										</div>
										<div className="mt-3 flex flex-wrap gap-1">
											{user.memberships.slice(0, 3).map((membership) => (
												<Badge key={membership.id} variant="outline" className="normal-case tracking-normal">
													{membership.projectSlug}:{membership.role}
												</Badge>
											))}
											{user.memberships.length > 3 ? (
												<Badge variant="outline" className="normal-case tracking-normal">
													+{user.memberships.length - 3}
												</Badge>
											) : null}
										</div>
										<div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
											<span className="inline-flex items-center gap-1">
												<Clock3 className="h-3 w-3" /> {activeCount} active
											</span>
											<span className="inline-flex items-center gap-1">
												<Laptop className="h-3 w-3" /> {user.sessions.length} sessions
											</span>
											<span className="inline-flex items-center gap-1">
												<KeyRound className="h-3 w-3" /> {user.projectSessions.length} tokens
											</span>
										</div>
									</button>
								);
							})}
						</div>
					</aside>

					<section className="min-w-0 p-4">
						{selectedUser ? (
							<div className="grid gap-4">
								<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-4">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<UserStatusBadge user={selectedUser} />
											{sessionUser?.id === selectedUser.id ? <Badge variant="secondary">You</Badge> : null}
										</div>
										<h2 className="mt-3 break-words font-display text-3xl leading-tight">
											{selectedUser.name ?? selectedUser.email}
										</h2>
										<p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selectedUser.id}</p>
									</div>
									<div className="flex flex-wrap justify-end gap-2">
										<Button
											size="sm"
											variant="outline"
											disabled={editingId === selectedUser.id}
											onClick={() => {
												setEditingId(selectedUser.id);
												setNameDraft(selectedUser.name ?? '');
											}}
										>
											<PenLine className="mr-2 h-3.5 w-3.5" />
											Rename
										</Button>
										{selectedUser.isBanned ? (
											<Button
												size="sm"
												variant="secondary"
												disabled={banMutation.isPending}
												onClick={() => banMutation.mutate({ userId: selectedUser.id, isBanned: false })}
											>
												<CheckCircle2 className="mr-2 h-3.5 w-3.5" />
												Unban
											</Button>
										) : (
											<Button
												size="sm"
												variant="outline"
												className="border-destructive/60 text-destructive hover:bg-destructive/10"
												disabled={sessionUser?.id === selectedUser.id || banMutation.isPending}
												onClick={() => {
													setBanUserId(selectedUser.id);
													setBanReason('');
													setBanUntil('');
													setBanDateError(null);
												}}
											>
												<Ban className="mr-2 h-3.5 w-3.5" />
												Ban
											</Button>
										)}
									</div>
								</div>

								{editingId === selectedUser.id ? (
									<div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
										<Label htmlFor="user-name-draft">Display name</Label>
										<div className="mt-2 flex flex-wrap items-center gap-2">
											<Input
												id="user-name-draft"
												className="max-w-[340px]"
												value={nameDraft}
												onChange={(e) => setNameDraft(e.target.value)}
											/>
											<Button
												size="sm"
												variant="secondary"
												disabled={nameMutation.isPending}
												onClick={() =>
													nameMutation.mutate({
														userId: selectedUser.id,
														name: nameDraft.trim() || null,
													})
												}
											>
												Save
											</Button>
											<Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
												Cancel
											</Button>
										</div>
									</div>
								) : null}

								<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<InfoRow label="Email" value={selectedUser.email} />
									<InfoRow label="Name" value={selectedUser.name} />
									<InfoRow label="Phone" value={selectedUser.phoneNumber} />
									<InfoRow label="Avatar URL" value={selectedUser.avatarUrl} />
									<InfoRow label="Created" value={formatDt(selectedUser.createdAt)} />
									<InfoRow label="Updated" value={formatDt(selectedUser.updatedAt)} />
									<InfoRow label="Banned at" value={formatDt(selectedUser.bannedAt)} />
									<InfoRow label="Banned until" value={formatDt(selectedUser.bannedUntil)} />
									<InfoRow label="Ban reason" value={selectedUser.banReason} />
								</div>

								<div className="rounded-lg border border-border/70 bg-muted/20 p-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h3 className="font-display text-xl">Project access</h3>
										<Badge variant="outline">{selectedUser.memberships.length} memberships</Badge>
									</div>
									<div className="mt-3 grid gap-2 md:grid-cols-2">
										{selectedUser.memberships.map((membership) => (
											<div key={membership.id} className="rounded-lg border border-border/70 bg-card/70 p-3">
												<div className="flex flex-wrap items-center justify-between gap-2">
													<p className="font-semibold text-foreground">{membership.projectName}</p>
													<Badge variant="secondary">{membership.role}</Badge>
												</div>
												<p className="mt-1 font-mono text-xs text-muted-foreground">
													{membership.projectSlug} / {shortId(membership.projectId)}
												</p>
												<p className="mt-2 text-xs text-muted-foreground">
													Joined {formatDt(membership.createdAt)}
												</p>
											</div>
										))}
									</div>
								</div>

								<div className="grid gap-3 sm:grid-cols-3">
									<div className="rounded-lg border border-border/70 bg-muted/25 p-4">
										<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
											<Activity className="h-4 w-4 text-primary" />
											Active
										</p>
										<p className="mt-3 font-display text-3xl">
											{selectedUser.sessions.filter((session) => session.isActive).length}
										</p>
									</div>
									<div className="rounded-lg border border-border/70 bg-muted/25 p-4">
										<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
											<ShieldCheck className="h-4 w-4 text-primary" />
											Trusted
										</p>
										<p className="mt-3 font-display text-3xl">
											{selectedUser.sessions.filter((session) => session.isTrusted).length}
										</p>
									</div>
									<div className="rounded-lg border border-border/70 bg-muted/25 p-4">
										<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
											<Wifi className="h-4 w-4 text-primary" />
											Devices
										</p>
										<p className="mt-3 font-display text-3xl">
											{selectedUser.sessions.filter((session) => session.device).length}
										</p>
									</div>
								</div>

								<div className="grid gap-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<h3 className="font-display text-xl">Global account/device sessions</h3>
											<p className="text-sm text-muted-foreground">
												These login sessions are not tied to a single project. Revoking one signs
												the account out for every project using that device/session.
											</p>
										</div>
										<Badge variant="outline">{selectedUser.sessions.length} total</Badge>
									</div>
									{selectedUser.sessions.length === 0 ? (
										<div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-5 text-sm text-muted-foreground">
											No sessions are stored for this user.
										</div>
									) : (
										<div className="grid gap-3">
											{selectedUser.sessions.map((session) => (
												<SessionRow
													key={session.id}
													session={session}
													memberships={selectedUser.memberships}
													canRevoke={canRevokeSelectedUserSessions}
													isRevoking={sessionRevokeMutation.isPending}
													onRevoke={(targetSession) => {
														const confirmed = window.confirm(
															`Revoke session ${shortId(targetSession.id)} for ${selectedUser.email}?`,
														);
														if (!confirmed) return;
														sessionRevokeMutation.mutate({
															userId: selectedUser.id,
															sessionId: targetSession.id,
														});
													}}
												/>
											))}
										</div>
									)}
								</div>
								<div className="grid gap-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<h3 className="font-display text-xl">Project token sessions</h3>
											<p className="text-sm text-muted-foreground">
												These are OIDC refresh tokens, so they show the project and client they
												were issued for.
											</p>
										</div>
										<Badge variant="outline">{selectedUser.projectSessions.length} total</Badge>
									</div>
									{selectedUser.projectSessions.length === 0 ? (
										<div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-5 text-sm text-muted-foreground">
											No project token sessions are stored for this user in the current scope.
										</div>
									) : (
										<div className="grid gap-3">
											{selectedUser.projectSessions.map((session) => (
												<ProjectTokenSessionRow key={session.id} session={session} />
											))}
										</div>
									)}
								</div>
								{sessionRevokeErr ? (
									<p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
										{sessionRevokeErr}
									</p>
								) : null}
							</div>
						) : (
							<div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 p-8 text-center">
								<div>
									<UserCircle className="mx-auto h-10 w-10 text-muted-foreground" />
									<p className="mt-3 text-sm text-muted-foreground">Select a user to inspect.</p>
								</div>
							</div>
						)}
					</section>
				</CardContent>
			</Card>

			{banUserId ? (
				<Card>
					<CardHeader>
						<CardTitle>Ban user</CardTitle>
						<CardDescription>
							{banTarget?.email ?? 'Selected user'} will be blocked from sign-in and admin OTP.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="ban-reason">Reason</Label>
							<Textarea
								id="ban-reason"
								value={banReason}
								onChange={(e) => setBanReason(e.target.value)}
								rows={3}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="ban-until">Ban until (optional)</Label>
							<Input
								id="ban-until"
								type="datetime-local"
								value={banUntil}
								onChange={(e) => setBanUntil(e.target.value)}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								className="border-destructive/60 text-destructive hover:bg-destructive/10"
								disabled={banMutation.isPending}
								onClick={() => {
									if (banUntil.trim().length > 0) {
										const parsed = new Date(banUntil);
										if (Number.isNaN(parsed.getTime())) {
											setBanDateError('Invalid date');
											return;
										}
										setBanDateError(null);
									} else {
										setBanDateError(null);
									}
									const untilIso =
										banUntil.trim().length > 0 ? new Date(banUntil).toISOString() : null;
									banMutation.mutate({
										userId: banUserId,
										isBanned: true,
										reason: banReason.trim() || null,
										until: untilIso,
									});
								}}
							>
								<CalendarClock className="mr-2 h-4 w-4" />
								Confirm ban
							</Button>
							<Button variant="outline" onClick={() => setBanUserId(null)}>
								Cancel
							</Button>
						</div>
						{banDateError ? <p className="text-sm text-destructive">{banDateError}</p> : null}
						{banMutation.isError ? (
							<p className="text-sm text-destructive">
								{banMutation.error instanceof Error ? banMutation.error.message : 'Ban failed'}
							</p>
						) : null}
					</CardContent>
				</Card>
			) : null}

			{nameMutation.isError ? (
				<p className="text-sm text-destructive">
					{nameMutation.error instanceof Error ? nameMutation.error.message : 'Update failed'}
				</p>
			) : null}
		</div>
	);
}
