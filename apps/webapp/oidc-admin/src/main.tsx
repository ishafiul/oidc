import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/router';
import { useAdminSessionQuery } from '@/hooks/use-oidc-queries';
import { useAdminStore } from '@/stores/admin-store';
import '@/index.css';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

function SessionBootstrap() {
	const setSessionUser = useAdminStore((state) => state.setSessionUser);
	const setSessionLoaded = useAdminStore((state) => state.setSessionLoaded);
	const sessionQuery = useAdminSessionQuery();

	useEffect(() => {
		if (sessionQuery.isSuccess) {
			setSessionUser(sessionQuery.data.user);
			setSessionLoaded(true);
		}
		if (sessionQuery.isError) {
			setSessionUser(null);
			setSessionLoaded(true);
		}
	}, [
		sessionQuery.data,
		sessionQuery.isError,
		sessionQuery.isSuccess,
		setSessionLoaded,
		setSessionUser,
	]);

	return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<SessionBootstrap />
		</QueryClientProvider>
	</React.StrictMode>,
);
