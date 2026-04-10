import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAdminUser, type AdminUserRow } from '@/lib/api';
import { useAdminUsersQuery } from '@/hooks/use-oidc-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAdminStore } from '@/stores/admin-store';

function formatDt(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function UsersPage() {
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const sessionUser = useAdminStore((state) => state.sessionUser);

	const usersQuery = useAdminUsersQuery();
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

	const listErr =
		usersQuery.error instanceof Error ? usersQuery.error.message : usersQuery.isError ? 'Failed to load users' : null;

	return (
		<div className="grid gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Users</CardTitle>
					<CardDescription>
						All accounts in the identity store. Banning blocks sign-in and admin OTP for that user.
						When <span className="font-medium text-foreground">SYSTEM_ADMIN_USER_ID</span> is set in
						the API, only that user may open this list.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{usersQuery.isLoading ? (
						<p className="text-sm text-muted-foreground">Loading users…</p>
					) : null}
					{listErr ? <p className="text-sm text-destructive">{listErr}</p> : null}
					{usersQuery.isSuccess && sortedUsers.length === 0 ? (
						<p className="text-sm text-muted-foreground">No users yet.</p>
					) : null}
					{sortedUsers.length > 0 ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Email</TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Created</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{sortedUsers.map((user: AdminUserRow) => {
									const isSelf = sessionUser?.id === user.id;
									const isEditing = editingId === user.id;
									return (
										<TableRow key={user.id}>
											<TableCell className="font-medium">{user.email}</TableCell>
											<TableCell>
												{isEditing ? (
													<div className="flex flex-wrap items-center gap-2">
														<Input
															className="h-8 max-w-[220px]"
															value={nameDraft}
															onChange={(e) => setNameDraft(e.target.value)}
														/>
														<Button
															size="sm"
															variant="secondary"
															disabled={nameMutation.isPending}
															onClick={() =>
																nameMutation.mutate({
																	userId: user.id,
																	name: nameDraft.trim() || null,
																})
															}
														>
															Save
														</Button>
														<Button
															size="sm"
															variant="ghost"
															onClick={() => setEditingId(null)}
														>
															Cancel
														</Button>
													</div>
												) : (
													<span className="text-muted-foreground">{user.name ?? '—'}</span>
												)}
											</TableCell>
											<TableCell>
												{user.isBanned ? (
													<div className="space-y-1">
														<Badge className="border-destructive/60 bg-destructive/15 text-destructive">
															Banned
														</Badge>
														{user.banReason ? (
															<p className="text-xs text-muted-foreground">{user.banReason}</p>
														) : null}
														{user.bannedUntil ? (
															<p className="text-xs text-muted-foreground">
																Until {formatDt(user.bannedUntil)}
															</p>
														) : null}
													</div>
												) : (
													<Badge variant="secondary">Active</Badge>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatDt(user.createdAt)}
											</TableCell>
											<TableCell className="text-right">
												<div className="flex flex-wrap justify-end gap-2">
													<Button
														size="sm"
														variant="outline"
														disabled={isEditing}
														onClick={() => {
															setEditingId(user.id);
															setNameDraft(user.name ?? '');
														}}
													>
														Rename
													</Button>
													{user.isBanned ? (
														<Button
															size="sm"
															variant="secondary"
															disabled={banMutation.isPending}
															onClick={() =>
																banMutation.mutate({ userId: user.id, isBanned: false })
															}
														>
															Unban
														</Button>
													) : (
														<Button
															size="sm"
															variant="outline"
															className="border-destructive/60 text-destructive hover:bg-destructive/10"
															disabled={isSelf || banMutation.isPending}
															onClick={() => {
																setBanUserId(user.id);
																setBanReason('');
																setBanUntil('');
																setBanDateError(null);
															}}
														>
															Ban
														</Button>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					) : null}
				</CardContent>
			</Card>

			{banUserId ? (
				<Card>
					<CardHeader>
						<CardTitle>Ban user</CardTitle>
						<CardDescription>Optional end time uses your local timezone; leave empty for indefinite.</CardDescription>
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
