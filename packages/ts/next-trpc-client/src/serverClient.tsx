import "server-only";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cache } from "react";
import { makeQueryClient } from "./queryClient";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "houserent-api-server/src/router";
import { headers, cookies } from "next/headers";
import React from "react";



/** Server-side ORPC client type with full type inference */
export type ServerORPCClient = RouterClient<AppRouter>;



function getServerUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787/rpc";
}



/** Get the QueryClient for the current request (cached per request) */
export const getQueryClient = cache(makeQueryClient);



type ServerAuthTokenGetter = () => Promise<string | null>;

let _getServerAuthToken: ServerAuthTokenGetter | undefined;

/** Set a custom function to get the auth token on the server */
export function setServerAuthTokenGetter(getter: ServerAuthTokenGetter): void {
    _getServerAuthToken = getter;
}

async function getAuthToken(): Promise<string | null> {
    if (_getServerAuthToken) {
        return _getServerAuthToken();
    }
    try {
        const cookieStore = await cookies();
        return cookieStore.get("access_token")?.value ?? null;
    } catch {
        return null;
    }
}



async function createServerLink() {
    const headersList = await headers();
    const cookie = headersList.get("cookie");
    const authToken = await getAuthToken();

    return new RPCLink({
        url: getServerUrl(),
        headers: () => {
            const h: Record<string, string> = {
                "x-orpc-source": "server",
            };
            if (cookie) {
                h["cookie"] = cookie;
            }
            if (authToken) {
                h["Authorization"] = `Bearer ${authToken}`;
            }
            return h;
        },
        fetch: (input, init) => {
            return fetch(input, {
                ...init,
                credentials: "include",
                cache: "no-store",
            } as RequestInit);
        },
    });
}



/** Get the server-side ORPC client (cached per request, includes user's auth) */
export const getServerClient = cache(async (): Promise<ServerORPCClient> => {
    const link = await createServerLink();
    return createORPCClient<ServerORPCClient>(link);
});



interface HydrateClientProps {
    children: React.ReactNode;
}

/** Wraps children with HydrationBoundary for client-side hydration */
export function HydrateClient({ children }: HydrateClientProps): React.ReactElement {
    const queryClient = getQueryClient();
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            {children}
        </HydrationBoundary>
    );
}



/** Generate a query key for ORPC procedures */
export function getORPCQueryKey<TInput = unknown>(
    path: string,
    input?: TInput
): readonly [string[], { input: TInput | undefined; type: "query" }] {
    return [path.split("."), { input, type: "query" }] as const;
}

function getProcedure<T>(client: ServerORPCClient, path: string): T {
    const pathParts = path.split(".");
    let current: unknown = client;
    for (const part of pathParts) {
        current = (current as Record<string, unknown>)[part];
    }
    return current as T;
}

/**
 * Prefetch a query on the server for client hydration.
 * @example await prefetchQuery("authRoutes.getUser", { id: "123" });
 */
export async function prefetchQuery<TInput = unknown>(
    path: string,
    input?: TInput
): Promise<void> {
    const queryClient = getQueryClient();
    const client = await getServerClient();
    const procedure = getProcedure<(input: TInput) => Promise<unknown>>(client, path);

    await queryClient.prefetchQuery({
        queryKey: getORPCQueryKey(path, input),
        queryFn: () => procedure(input as TInput),
    });
}

/**
 * Fetch data directly on the server (not for hydration).
 * @example const user = await serverFetch("authRoutes.getUser", { id: "123" });
 */
export async function serverFetch<TInput = unknown, TOutput = unknown>(
    path: string,
    input?: TInput
): Promise<TOutput> {
    const client = await getServerClient();
    const procedure = getProcedure<(input: TInput) => Promise<TOutput>>(client, path);
    return procedure(input as TInput);
}
