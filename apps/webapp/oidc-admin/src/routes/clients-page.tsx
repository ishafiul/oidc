import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { createClientInProject } from '@/lib/api';
import { useProjectClientsQuery, useProjectScopeSetsQuery } from '@/hooks/use-oidc-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminStore } from '@/stores/admin-store';

type ProjectClient = {
	readonly id: string;
	readonly name: string;
	readonly clientId: string;
	readonly redirectUris: string[];
	readonly scopeSetIds: string[];
};

export function ClientsPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/clients' });
	const queryClient = useQueryClient();
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);

	const clientsQuery = useProjectClientsQuery(slug);
	const scopeSetsQuery = useProjectScopeSetsQuery(slug);

	const [name, setName] = useState('');
	const [clientId, setClientId] = useState('');
	const [redirectUris, setRedirectUris] = useState('http://localhost:3000/callback');
	const [isPublic, setIsPublic] = useState(true);
	const [scopeSetIds, setScopeSetIds] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	const createClientMutation = useMutation({
		mutationFn: async () =>
			createClientInProject(apiBaseUrl, slug, {
				name,
				clientId,
				isPublic,
				redirectUris: redirectUris
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
				scopeSetIds: scopeSetIds
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
			}),
		onSuccess: async () => {
			setName('');
			setClientId('');
			setErrorMessage(null);
			await queryClient.invalidateQueries({ queryKey: ['projects', slug, 'clients'] });
		},
		onError: (error) => {
			setErrorMessage(error instanceof Error ? error.message : 'Failed to create client');
		},
	});

	return (
		<div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
			<Card>
				<CardHeader>
					<CardTitle>OIDC Clients</CardTitle>
					<CardDescription>Project: {slug}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					{clientsQuery.data?.map((client: ProjectClient) => (
						<div key={client.id} className="rounded-lg border border-border/70 p-3">
							<p className="text-sm font-medium">{client.name}</p>
							<p className="text-xs text-muted-foreground">client_id: {client.clientId}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								callbacks: {client.redirectUris.join(', ')}
							</p>
							<p className="text-xs text-muted-foreground">
								scope sets: {client.scopeSetIds.length ? client.scopeSetIds.join(', ') : 'none'}
							</p>
						</div>
					))}
					{clientsQuery.data?.length === 0 ? (
						<p className="text-sm text-muted-foreground">No clients created.</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Create Client</CardTitle>
					<CardDescription>Client IDs are unique per project.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="client-name">Name</Label>
						<Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="client-id">Client ID</Label>
						<Input
							id="client-id"
							value={clientId}
							onChange={(event) => setClientId(event.target.value)}
							placeholder="web-admin-app"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="redirect-uris">Redirect URIs (comma separated)</Label>
						<Input
							id="redirect-uris"
							value={redirectUris}
							onChange={(event) => setRedirectUris(event.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="scope-set-ids">Scope Set IDs (comma separated)</Label>
						<Input
							id="scope-set-ids"
							value={scopeSetIds}
							onChange={(event) => setScopeSetIds(event.target.value)}
							placeholder={scopeSetsQuery.data?.[0]?.id ?? 'optional'}
						/>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={isPublic}
							onChange={(event) => setIsPublic(event.target.checked)}
						/>
						Public client
					</label>
					<Button
						className="w-full"
						disabled={createClientMutation.isPending || !name || !clientId}
						onClick={() => createClientMutation.mutate()}
					>
						Create Client
					</Button>
					{errorMessage ? (
						<p className="text-xs text-destructive">{errorMessage}</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
