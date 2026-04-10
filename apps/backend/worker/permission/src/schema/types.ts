import { z } from 'zod';

export interface SchemaConfig<
	TDocTypes extends readonly string[],
	TRelations extends readonly string[],
	TPermissions extends readonly string[],
> {
	projectId: string;
	docTypes: TDocTypes;
	relations: TRelations;
	permissions: TPermissions;
	encryptionKey?: string;
}

export function validateProjectId(projectId: string): void {
	if (!projectId || projectId.trim() === '') {
		throw new Error('projectId is required for data isolation');
	}
	if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
		throw new Error('projectId must be alphanumeric with hyphens/underscores only');
	}
}

export type InferDocTypes<T> = T extends SchemaConfig<infer D, infer _R, infer _P> ? D[number] : never;
export type InferRelations<T> = T extends SchemaConfig<infer _D, infer R, infer _P> ? R[number] : never;
export type InferPermissions<T> = T extends SchemaConfig<infer _D, infer _R, infer P> ? P[number] : never;

export type InferDocTypeTuple<T> = T extends SchemaConfig<infer D, infer _R, infer _P> ? D : never;
export type InferRelationTuple<T> = T extends SchemaConfig<infer _D, infer R, infer _P> ? R : never;
export type InferPermissionTuple<T> = T extends SchemaConfig<infer _D, infer _R, infer P> ? P : never;

export type InferResource<T> = T extends SchemaConfig<infer D, infer _R, infer _P>
	? { readonly type: D[number]; readonly id: string }
	: never;

export type InferUserSubject = `user:${string}`;
export type InferGroupSubject = `group:${string}`;
export type InferApiKeySubject = `api_key:${string}`;
export type InferSubject = InferUserSubject | InferGroupSubject | InferApiKeySubject;

export type SchemaDefinition<
	TDocTypes extends readonly string[] = readonly string[],
	TRelations extends readonly string[] = readonly string[],
	TPermissions extends readonly string[] = readonly string[],
> = {
	readonly projectId: string;
	readonly docTypes: TDocTypes;
	readonly relations: TRelations;
	readonly permissions: TPermissions;
	readonly docTypeSchema: z.ZodType<string>;
	readonly relationSchema: z.ZodType<string>;
	readonly permissionSchema: z.ZodType<string>;
	readonly encryptionKey?: string;
};

export function createDocTypeSchema<T extends readonly [string, ...string[]]>(
	docTypes: T
): z.ZodType<string> {
	return z.enum(docTypes);
}

export function createRelationSchema<T extends readonly [string, ...string[]]>(
	relations: T
): z.ZodType<string> {
	return z.enum(relations);
}

export function createPermissionSchema<T extends readonly [string, ...string[]]>(
	permissions: T
): z.ZodType<string> {
	return z.enum(permissions);
}

export type SubjectType = 'user' | 'group' | 'api_key';

export interface SubjectPattern {
	type: SubjectType;
	id: string;
}

export function parseSubject(subject: string): SubjectPattern | null {
	const match = subject.match(/^(user|group|api_key):([a-zA-Z0-9_-]+)$/);
	if (!match) return null;
	return { type: match[1] as SubjectType, id: match[2] };
}

export function createSubject<T extends SubjectType>(
	type: T,
	id: string
): T extends 'user' ? InferUserSubject : T extends 'group' ? InferGroupSubject : InferApiKeySubject {
	return `${type}:${id}` as T extends 'user'
		? InferUserSubject
		: T extends 'group'
			? InferGroupSubject
			: InferApiKeySubject;
}

export function defineConfig<
	const TDocTypes extends readonly [string, ...string[]],
	const TRelations extends readonly [string, ...string[]],
	const TPermissions extends readonly [string, ...string[]],
>(config: SchemaConfig<TDocTypes, TRelations, TPermissions>): SchemaConfig<TDocTypes, TRelations, TPermissions> {
	return config;
}
