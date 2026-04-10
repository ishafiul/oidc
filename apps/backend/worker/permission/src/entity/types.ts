export type UserSubject = `user:${string}`;
export type GroupSubject = `group:${string}`;
export type ApiKeySubject = `api_key:${string}`;
export type Subject = UserSubject | GroupSubject | ApiKeySubject;

export type Relation = string;

export interface Resource<TDocType extends string = string> {
	readonly type: TDocType;
	readonly id: string;
}

export function resource<TDocType extends string>(
	type: TDocType,
	id: string
): Resource<TDocType> {
	return { type, id } as const;
}

export function isResource<TDocType extends string>(
	value: unknown
): value is Resource<TDocType> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		'id' in value &&
		typeof (value as Resource).type === 'string' &&
		typeof (value as Resource).id === 'string'
	);
}

export interface RelationTuple {
	subject: Subject;
	relation: Relation;
	expires_at?: number;
}

export interface RelationshipTuples {
	tuples: RelationTuple[];
}

export interface RelationDefinition<TPermission extends string = string> {
	permissions: TPermission[];
	inherits: Relation[];
}

export type RelationshipKey = `rel:${string}:${string}`;
export type GroupMembershipKey = `group_membership:${string}`;
export type RelationDefKey = `relation_def:${string}:${string}`;
export type MetaKey = `meta:${string}:${string}`;

export function createRelationshipKey(type: string, id: string): RelationshipKey {
	return `rel:${type}:${id}`;
}

export function createGroupMembershipKey(subject: Subject): GroupMembershipKey {
	return `group_membership:${subject}`;
}

export function createRelationDefKey(type: string, relation: string): RelationDefKey {
	return `relation_def:${type}:${relation}`;
}

export function parseRelationshipKey(key: string): { type: string; id: string } | null {
	const match = key.match(/^rel:([^:]+):(.+)$/);
	if (!match) return null;
	return { type: match[1], id: match[2] };
}

export function parseRelationDefKey(key: string): { type: string; relation: string } | null {
	const match = key.match(/^relation_def:([^:]+):(.+)$/);
	if (!match) return null;
	return { type: match[1], relation: match[2] };
}

export function isUserSubject(subject: string): subject is `user:${string}` {
	return subject.startsWith('user:');
}

export function isGroupSubject(subject: string): subject is `group:${string}` {
	return subject.startsWith('group:');
}

export function isApiKeySubject(subject: string): subject is `api_key:${string}` {
	return subject.startsWith('api_key:');
}

export function extractSubjectId(subject: Subject): string {
	return subject.split(':')[1];
}

export function createUserSubject(userId: string): UserSubject {
	return `user:${userId}`;
}

export function createGroupSubject(groupId: string): GroupSubject {
	return `group:${groupId}`;
}

export function createApiKeySubject(apiKeyId: string): ApiKeySubject {
	return `api_key:${apiKeyId}`;
}

export function user(id: string): UserSubject {
	return `user:${id}`;
}

export function group(id: string): GroupSubject {
	return `group:${id}`;
}

export function apiKey(id: string): ApiKeySubject {
	return `api_key:${id}`;
}

export type SubjectType = 'user' | 'group' | 'api_key';

export interface ParsedSubject {
	type: SubjectType;
	id: string;
}

export function parseSubject(subject: Subject): ParsedSubject {
	const [type, id] = subject.split(':') as [SubjectType, string];
	return { type, id };
}

export function isValidSubject(value: string): value is Subject {
	return isUserSubject(value) || isGroupSubject(value) || isApiKeySubject(value);
}

export function tryParseSubject(value: string): ParsedSubject | null {
	if (!isValidSubject(value)) return null;
	return parseSubject(value);
}
