import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { inviteMember, type ProjectRole, updateMemberRole } from '@/lib/api';
import { useProjectMembersQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminStore } from '@/stores/admin-store';

const roleOptions: ProjectRole[] = ['owner', 'admin', 'editor', 'viewer'];

type ProjectMember = {
	readonly id: string;
	readonly userId: string;
	readonly role: string;
	readonly user: {
		readonly email: string;
	} | null;
};

export function MembersPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/members' });
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const membersQuery = useProjectMembersQuery(slug);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteRole, setInviteRole] = useState<ProjectRole>('viewer');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	const inviteMutation = useMutation({
		mutationFn: async () => inviteMember(apiBaseUrl, slug, { email: inviteEmail, role: inviteRole }),
		onSuccess: async () => {
			setInviteEmail('');
			setErrorMessage(null);
			await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'members'] });
		},
		onError: (error) => {
			setErrorMessage(error instanceof Error ? error.message : 'Failed to invite member');
		},
	});

	const roleMutation = useMutation({
		mutationFn: async (input: { userId: string; role: ProjectRole }) =>
			updateMemberRole(apiBaseUrl, slug, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'members'] });
		},
	});

	return (
		<div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
					<CardDescription>Project: {slug}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{membersQuery.data?.map((member: ProjectMember) => (
						<div key={member.id} className="flex items-center justify-between rounded-lg border border-border/70 p-3">
							<div>
								<p className="text-sm font-medium">{member.user?.email ?? member.userId}</p>
								<p className="text-xs text-muted-foreground">role: {member.role}</p>
							</div>
							<select
								className="rounded-md border border-border bg-background px-2 py-1 text-sm"
								value={member.role}
								onChange={(event) =>
									roleMutation.mutate({
										userId: member.userId,
										role: event.target.value as ProjectRole,
									})
								}
							>
								{roleOptions.map((role) => (
									<option key={role} value={role}>
										{role}
									</option>
								))}
							</select>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Invite Member</CardTitle>
					<CardDescription>Invites are project-scoped.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="invite-email">Email</Label>
						<Input
							id="invite-email"
							type="email"
							value={inviteEmail}
							onChange={(event) => setInviteEmail(event.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-role">Role</Label>
						<select
							id="invite-role"
							className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
							value={inviteRole}
							onChange={(event) => setInviteRole(event.target.value as ProjectRole)}
						>
							{roleOptions.map((role) => (
								<option key={role} value={role}>
									{role}
								</option>
							))}
						</select>
					</div>
					<Button
						className="w-full"
						disabled={inviteMutation.isPending || !inviteEmail}
						onClick={() => inviteMutation.mutate()}
					>
						Send Invite
					</Button>
					{errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
				</CardContent>
			</Card>
		</div>
	);
}
