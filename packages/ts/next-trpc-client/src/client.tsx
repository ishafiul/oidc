"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "houserent-api-server/src/router";
import React, { useEffect } from "react";
import { makeQueryClient } from "./queryClient";



/** ORPC client type with full type inference from router */
export type ORPCClient = RouterClient<AppRouter>;



let clientQueryClientSingleton: QueryClient | undefined;

function getQueryClient(): QueryClient {
    if (typeof globalThis.document === "undefined") {
        return makeQueryClient();
    }
    if (!clientQueryClientSingleton) {
        clientQueryClientSingleton = makeQueryClient();
    }
    return clientQueryClientSingleton;
}



function getUrl(): string {
    const env = globalThis.process?.env ?? {};
    return env.NEXT_PUBLIC_API_URL || "http://localhost:8787/rpc";
}



type AuthTokenGetter = () => string | null | Promise<string | null>;
type TokenRefresher = () => Promise<string | null>;

let _getAuthToken: AuthTokenGetter | undefined;
let _refreshToken: TokenRefresher | undefined;
let _isRefreshing = false;
let _refreshPromise: Promise<string | null> | null = null;

/** Set the function to get the current auth token */
export function setAuthTokenGetter(getter: AuthTokenGetter): void {
    _getAuthToken = getter;
}

/** Set the function to refresh the auth token (called on 401) */
export function setTokenRefresher(refresher: TokenRefresher): void {
    _refreshToken = refresher;
}

async function refreshTokenWithMutex(): Promise<string | null> {
    if (_isRefreshing && _refreshPromise) {
        return _refreshPromise;
    }
    if (!_refreshToken) {
        return null;
    }
    _isRefreshing = true;
    _refreshPromise = _refreshToken();
    try {
        return await _refreshPromise;
    } finally {
        _isRefreshing = false;
        _refreshPromise = null;
    }
}



function createLink() {
    return new RPCLink({
        url: getUrl(),
        headers: async () => {
            const headers: Record<string, string> = {};
            if (_getAuthToken) {
                const token = await _getAuthToken();
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }
            }
            return headers;
        },
        fetch: async (input, init) => {
            const request = input instanceof Request ? input : new Request(input);
            const response = await globalThis.fetch(request, {
                ...init,
                credentials: "include",
            } as RequestInit);

            if (response.status === 401 && _refreshToken) {
                const newToken = await refreshTokenWithMutex();
                if (newToken) {
                    const newHeaders = new Headers(request.headers);
                    newHeaders.set("Authorization", `Bearer ${newToken}`);
                    const newRequest = new Request(request, { headers: newHeaders });
                    return globalThis.fetch(newRequest, {
                        ...init,
                        credentials: "include",
                    } as RequestInit);
                }
            }
            return response;
        },
    });
}



/** ORPC client for direct procedure calls */
export const orpcClient: ORPCClient = createORPCClient<ORPCClient>(createLink());

/** Tanstack Query utilities for useQuery/useMutation */
export const orpc = createTanstackQueryUtils(orpcClient);

/** Get a fresh ORPC client instance */
export function getORPCClient(): ORPCClient {
    return createORPCClient<ORPCClient>(createLink());
}

/** Get fresh Tanstack Query utilities */
export function getORPC() {
    return createTanstackQueryUtils(getORPCClient());
}



interface ORPCError {
    code?: string;
    message?: string;
    data?: { message?: string };
}

function handleORPCError(error: unknown): void {
    const err = error as ORPCError;
    if (err?.code === "NETWORK_ERROR" || err?.code === "CANCELLED") {
        return;
    }
    const errorMessage = err?.message ?? err?.data?.message ?? "An unexpected error occurred";
    console.error("[ORPC Error]:", errorMessage);
}



interface ORPCProviderProps {
    readonly children: React.ReactNode;
}

/** Provider that wraps the app with QueryClientProvider and global error handling */
export function ORPCProvider({ children }: ORPCProviderProps): React.ReactElement {
    const queryClient = getQueryClient();

    useEffect(() => {
        const queryUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (
                event?.type === "updated" &&
                event.query.state.status === "error" &&
                event.query.state.error
            ) {
                handleORPCError(event.query.state.error);
            }
        });

        const mutationUnsubscribe = queryClient.getMutationCache().subscribe((event) => {
            if (
                event?.type === "updated" &&
                event.mutation?.state.status === "error" &&
                event.mutation?.state.error
            ) {
                handleORPCError(event.mutation.state.error);
            }
        });

        return () => {
            queryUnsubscribe();
            mutationUnsubscribe();
        };
    }, [queryClient]);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}