import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useOidcDiscoveryQuery, useOidcJwksQuery } from '@/hooks/use-oidc-queries';
import { useAdminStore } from '@/stores/admin-store';

export function ProtocolPage() {
	const { slug } = useParams({ from: '/app/projects/$slug/protocol' });
	const setSelectedProjectSlug = useAdminStore((state) => state.setSelectedProjectSlug);
	const discoveryQuery = useOidcDiscoveryQuery(slug);
	const jwksQuery = useOidcJwksQuery(slug);

	useEffect(() => {
		setSelectedProjectSlug(slug);
	}, [setSelectedProjectSlug, slug]);

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">Protocol Inspector</h2>
				<p className="text-sm text-muted-foreground">Project: {slug}</p>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<section className="rounded-lg border border-border/70 p-3">
					<p className="mb-2 text-sm font-medium">Discovery</p>
					<pre className="max-h-[440px] overflow-auto rounded-md bg-secondary/20 p-3 text-xs">
						{JSON.stringify(
							discoveryQuery.isError
								? { error: discoveryQuery.error.message }
								: (discoveryQuery.data ?? { status: 'loading' }),
							null,
							2,
						)}
					</pre>
				</section>
				<section className="rounded-lg border border-border/70 p-3">
					<p className="mb-2 text-sm font-medium">JWKS</p>
					<pre className="max-h-[440px] overflow-auto rounded-md bg-secondary/20 p-3 text-xs">
						{JSON.stringify(
							jwksQuery.isError ? { error: jwksQuery.error.message } : (jwksQuery.data ?? { status: 'loading' }),
							null,
							2,
						)}
					</pre>
				</section>
			</div>
		</div>
	);
}
