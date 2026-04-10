import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function normalizeBaseUrl(value: string): string {
	return value.trim().replace(/\/+$/, '');
}

const defaultBaseUrl = normalizeBaseUrl(
	import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787',
);

export interface AdminSessionUser {
	readonly id: string;
	readonly email: string;
	readonly name: string | null;
}

export interface AdminStoreState {
	readonly apiBaseUrl: string;
	readonly sessionUser: AdminSessionUser | null;
	readonly selectedProjectSlug: string | null;
	readonly sessionLoaded: boolean;
	setApiBaseUrl: (value: string) => void;
	setSessionUser: (value: AdminSessionUser | null) => void;
	setSelectedProjectSlug: (value: string | null) => void;
	setSessionLoaded: (value: boolean) => void;
	clearSession: () => void;
}

export const useAdminStore = create<AdminStoreState>()(
	persist(
		(set) => ({
			apiBaseUrl: defaultBaseUrl,
			sessionUser: null,
			selectedProjectSlug: null,
			sessionLoaded: false,
			setApiBaseUrl: (value) => {
				set({ apiBaseUrl: normalizeBaseUrl(value) });
			},
			setSessionUser: (value) => {
				set({ sessionUser: value });
			},
			setSelectedProjectSlug: (value) => {
				set({ selectedProjectSlug: value });
			},
			setSessionLoaded: (value) => {
				set({ sessionLoaded: value });
			},
			clearSession: () => {
				set({
					sessionUser: null,
					sessionLoaded: true,
				});
			},
		}),
		{
			name: 'oidc-admin-store',
			partialize: (state) => ({
				apiBaseUrl: state.apiBaseUrl,
				selectedProjectSlug: state.selectedProjectSlug,
			}),
		},
	),
);
