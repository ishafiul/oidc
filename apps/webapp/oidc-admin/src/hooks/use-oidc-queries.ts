import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
	FGAC_DOC_TYPES,
	type FgacDocType,
	clearAdminCsrfToken,
	fetchProjectDiscovery,
	fetchProjectJwks,
	getAdminSession,
	hydrateAdminCsrfFromCookie,
	getProject,
	getProjectGroupMembers,
	getProjectGroupRelations,
	getUserFgacRelations,
	listAdminUsers,
	listClients,
	listMembers,
	listProjectGroups,
	listProjectApiKeys,
	listProjects,
	listRelations,
	listScopeSets,
} from '@/lib/api';
import { useMemo } from 'react';
import { useAdminStore } from '@/stores/admin-store';

export function useAdminSessionQuery() {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['admin', 'session', apiBaseUrl],
		queryFn: async () => {
			hydrateAdminCsrfFromCookie();
			const res = await getAdminSession(apiBaseUrl);
			if (res.authenticated) {
				hydrateAdminCsrfFromCookie();
			} else {
				clearAdminCsrfToken();
			}
			return res;
		},
		enabled: Boolean(apiBaseUrl),
		staleTime: 30_000,
	});
}

export function useProjectsQuery() {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', apiBaseUrl],
		queryFn: () => listProjects(apiBaseUrl),
		enabled: Boolean(apiBaseUrl),
		staleTime: 15_000,
	});
}

export function useAdminUsersQuery() {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['admin', 'users', apiBaseUrl],
		queryFn: () => listAdminUsers(apiBaseUrl),
		enabled: Boolean(apiBaseUrl),
		staleTime: 15_000,
	});
}

export function useProjectClientsQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'clients', apiBaseUrl],
		queryFn: () => listClients(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

export function useProjectScopeSetsQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'scope-sets', apiBaseUrl],
		queryFn: () => listScopeSets(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

export function useProjectMembersQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'members', apiBaseUrl],
		queryFn: () => listMembers(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

export function useProjectDetailQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'detail', apiBaseUrl],
		queryFn: () => getProject(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

export function useProjectRelationsQuery(projectSlug: string | null, type: FgacDocType) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'permissions', 'relations', type, apiBaseUrl],
		queryFn: () => listRelations(apiBaseUrl, projectSlug ?? '', type),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

type ListRelationsResult = Awaited<ReturnType<typeof listRelations>>;

export function useFgacSchemaQueries(projectSlug: string | null, docTypes: readonly string[]) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	const types = useMemo(
		() => (docTypes.length > 0 ? [...docTypes] : [...FGAC_DOC_TYPES]),
		[docTypes],
	);

	return useQueries({
		queries: types.map((type) => ({
			queryKey: ['projects', projectSlug, 'permissions', 'relations', type, apiBaseUrl],
			queryFn: () => listRelations(apiBaseUrl, projectSlug ?? '', type as FgacDocType),
			enabled: Boolean(apiBaseUrl && projectSlug),
			staleTime: 15_000,
		})),
		combine: (
			results,
		): {
			byType: Map<string, UseQueryResult<ListRelationsResult, Error>>;
			types: string[];
		} => {
			const byType = new Map<string, UseQueryResult<ListRelationsResult, Error>>();
			for (let i = 0; i < types.length; i++) {
				const t = types[i];
				const r = results[i];
				if (t !== undefined && r !== undefined) {
					byType.set(t, r as UseQueryResult<ListRelationsResult, Error>);
				}
			}
			return { byType, types };
		},
	});
}

export function useProjectGroupsQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'permissions', 'groups', apiBaseUrl],
		queryFn: () => listProjectGroups(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}

export function useProjectGroupMembersQuery(projectSlug: string | null, group: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'permissions', 'groups', group, 'members', apiBaseUrl],
		queryFn: () => getProjectGroupMembers(apiBaseUrl, projectSlug ?? '', group ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug && group),
		staleTime: 15_000,
	});
}

export function useProjectGroupRelationsQuery(projectSlug: string | null, group: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'permissions', 'groups', group, 'relations', apiBaseUrl],
		queryFn: () => getProjectGroupRelations(apiBaseUrl, projectSlug ?? '', group ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug && group),
		staleTime: 15_000,
	});
}

export function useUserFgacRelationsQueries(
	projectSlug: string | null,
	userId: string | null,
	docTypes: readonly string[],
) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const types = docTypes.length > 0 ? docTypes : [...FGAC_DOC_TYPES];

	return useQueries({
		queries: types.map((type) => ({
			queryKey: ['projects', projectSlug, 'permissions', 'user', userId, type, apiBaseUrl],
			queryFn: () => getUserFgacRelations(apiBaseUrl, projectSlug ?? '', userId ?? '', type),
			enabled: Boolean(apiBaseUrl && projectSlug && userId),
			staleTime: 15_000,
			meta: { fgacType: type },
		})),
	});
}

export function useAllMembersFgacQueries(
	projectSlug: string | null,
	memberUserIds: readonly string[],
	docTypes: readonly string[],
) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
	const types = docTypes.length > 0 ? docTypes : [...FGAC_DOC_TYPES];

	const pairs = useMemo(
		() => memberUserIds.flatMap((userId) => types.map((type) => ({ userId, type }))),
		[memberUserIds, types],
	);

	return useQueries({
		queries: pairs.map(({ userId, type }) => ({
			queryKey: ['projects', projectSlug, 'permissions', 'user', userId, type, apiBaseUrl],
			queryFn: () => getUserFgacRelations(apiBaseUrl, projectSlug ?? '', userId, type),
			enabled: Boolean(apiBaseUrl && projectSlug && userId),
			staleTime: 15_000,
			meta: { userId, fgacType: type },
		})),
	});
}

export function useOidcDiscoveryQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['oidc', projectSlug, 'discovery', apiBaseUrl],
		queryFn: () => fetchProjectDiscovery(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 30_000,
	});
}

export function useOidcJwksQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['oidc', projectSlug, 'jwks', apiBaseUrl],
		queryFn: () => fetchProjectJwks(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 30_000,
	});
}

export function useProjectApiKeysQuery(projectSlug: string | null) {
	const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);

	return useQuery({
		queryKey: ['projects', projectSlug, 'api-keys', apiBaseUrl],
		queryFn: () => listProjectApiKeys(apiBaseUrl, projectSlug ?? ''),
		enabled: Boolean(apiBaseUrl && projectSlug),
		staleTime: 15_000,
	});
}
