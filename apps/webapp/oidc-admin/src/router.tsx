import {
	Link,
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
} from '@tanstack/react-router';
import { AppShell } from '@/components/layout/app-shell';
import { LoginPage } from '@/routes/login-page';
import { ProjectsPage } from '@/routes/projects-page';
import { ClientsPage } from '@/routes/clients-page';
import { ScopeSetsPage } from '@/routes/scope-sets-page';
import { PermissionsPage } from '@/routes/permissions-page';
import { MembersPage } from '@/routes/members-page';
import { ProtocolPage } from '@/routes/protocol-page';
import { IntegrationPage } from '@/routes/integration-page';
import { AccessOverviewPage } from '@/routes/access-overview-page';
import { UsersPage } from '@/routes/users-page';
import { DashboardPage } from '@/routes/dashboard-page';
import { useAdminStore } from '@/stores/admin-store';

function NotFoundPage() {
	return (
		<div className="space-y-3">
			<h2 className="text-lg font-semibold">Route not found</h2>
			<Link className="text-sm text-primary hover:underline" to="/dashboard">
				Go to dashboard
			</Link>
		</div>
	);
}

const rootRoute = createRootRoute({
	notFoundComponent: NotFoundPage,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: LoginPage,
	beforeLoad: () => {
		const { sessionUser, sessionLoaded } = useAdminStore.getState();
		if (sessionLoaded && sessionUser) {
			throw redirect({ to: '/dashboard' });
		}
	},
});

const appRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'app',
	component: AppShell,
	beforeLoad: () => {
		const { sessionUser, sessionLoaded } = useAdminStore.getState();
		if (sessionLoaded && !sessionUser) {
			throw redirect({ to: '/login' });
		}
	},
});

const appIndexRoute = createRoute({
	getParentRoute: () => appRoute,
	path: '/',
	beforeLoad: () => {
		const { sessionUser, sessionLoaded } = useAdminStore.getState();
		if (sessionLoaded && sessionUser) {
			throw redirect({ to: '/dashboard' });
		}
	},
});

const dashboardRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'dashboard',
	component: DashboardPage,
});

const usersRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'users',
	component: UsersPage,
});

const projectsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects',
	component: ProjectsPage,
});

const clientsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/clients',
	component: ClientsPage,
});

const scopeSetsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/scope-sets',
	component: ScopeSetsPage,
});

const permissionsRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/permissions',
	component: PermissionsPage,
});

const accessOverviewRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/access',
	component: AccessOverviewPage,
});

const membersRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/members',
	component: MembersPage,
});

const protocolRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/protocol',
	component: ProtocolPage,
});

const integrationRoute = createRoute({
	getParentRoute: () => appRoute,
	path: 'projects/$slug/integration',
	component: IntegrationPage,
});

const routeTree = rootRoute.addChildren([
	loginRoute,
	appRoute.addChildren([
		appIndexRoute,
		dashboardRoute,
		usersRoute,
		projectsRoute,
		clientsRoute,
		scopeSetsRoute,
		permissionsRoute,
		accessOverviewRoute,
		membersRoute,
		protocolRoute,
		integrationRoute,
	]),
]);

export const router = createRouter({
	routeTree,
	defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
