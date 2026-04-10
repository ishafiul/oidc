import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminStore } from '@/stores/admin-store';

export function SettingsPage() {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const setApiBaseUrl = useAdminStore((state) => state.setApiBaseUrl);
	const [draft, setDraft] = useState(apiBaseUrl);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Settings</CardTitle>
				<CardDescription>Local API URL for this browser session.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="api-base-url">API Base URL</Label>
					<Input id="api-base-url" value={draft} onChange={(event) => setDraft(event.target.value)} />
				</div>
				<Button onClick={() => setApiBaseUrl(draft)}>Save</Button>
			</CardContent>
		</Card>
	);
}
