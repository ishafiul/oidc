import { z } from 'zod';
import {
	IStorage,
	RelationshipData,
	RelationDefinitionData,
	RelationTupleData,
	IRelationshipRepository,
	IRelationDefinitionRepository,
	IGroupMembershipRepository,
} from './interfaces';
import { Subject, parseSubject } from '../entity/types';

const RelationTupleDataSchema = z.object({
	subject: z.string(),
	relation: z.string(),
	expires_at: z.number().optional(),
});

const TupleValueSchema = z.object({
	expires_at: z.union([z.number(), z.null()]).optional(),
});

const RelationDefinitionDataSchema = z.object({
	permissions: z.array(z.string()),
	inherits: z.array(z.string()),
});

const GroupMembershipDataSchema = z.array(z.string());

const EMPTY_RELATIONSHIP: RelationshipData = { tuples: [] };

export class RelationshipRepository implements IRelationshipRepository {
	private readonly tuplePrefix: string;

	constructor(private readonly storage: IStorage, private readonly projectId: string) {
		this.tuplePrefix = `project:${projectId}:rel_tuple:`;
	}

	private encode(input: string): string {
		return encodeURIComponent(input);
	}

	private decode(input: string): string {
		return decodeURIComponent(input);
	}

	private resourcePrefix(type: string, id: string): string {
		return `${this.tuplePrefix}${this.encode(type)}:${this.encode(id)}:`;
	}

	private typePrefix(type: string): string {
		return `${this.tuplePrefix}${this.encode(type)}:`;
	}

	private tupleKey(type: string, id: string, subject: string, relation: string): string {
		return `${this.resourcePrefix(type, id)}${this.encode(subject)}:${this.encode(relation)}`;
	}

	private parseTupleKey(key: string): {
		type: string;
		id: string;
		subject: string;
		relation: string;
	} | null {
		if (!key.startsWith(this.tuplePrefix)) return null;
		const raw = key.substring(this.tuplePrefix.length);
		const parts = raw.split(':');
		if (parts.length !== 4) return null;

		return {
			type: this.decode(parts[0]),
			id: this.decode(parts[1]),
			subject: this.decode(parts[2]),
			relation: this.decode(parts[3]),
		};
	}

	private async getTupleValue(key: string): Promise<{ expires_at?: number } | null> {
		const data = await this.storage.get(key);
		if (!data) return null;
		const raw = TupleValueSchema.parse(JSON.parse(data));
		const at = raw.expires_at;
		return { expires_at: at === null || at === undefined ? undefined : at };
	}

	private async deleteByPrefix(prefix: string): Promise<void> {
		const listResult = await this.storage.list({ prefix });
		await Promise.all(listResult.keys.map((k) => this.storage.delete(k.name)));
	}

	async get(type: string, id: string): Promise<RelationshipData> {
		const prefix = this.resourcePrefix(type, id);
		const listResult = await this.storage.list({ prefix });
		if (listResult.keys.length === 0) return { ...EMPTY_RELATIONSHIP, tuples: [] };

		const tuples = await Promise.all(
			listResult.keys.map(async ({ name }) => {
				const parsed = this.parseTupleKey(name);
				if (!parsed) return null;
				const value = await this.getTupleValue(name);
				if (!value) return null;
				return RelationTupleDataSchema.parse({
					subject: parsed.subject,
					relation: parsed.relation,
					expires_at: value.expires_at,
				});
			})
		);

		return {
			tuples: tuples.filter((t): t is z.infer<typeof RelationTupleDataSchema> => t !== null),
		};
	}

	async save(type: string, id: string, data: RelationshipData): Promise<void> {
		await this.deleteByPrefix(this.resourcePrefix(type, id));
		await Promise.all(
			data.tuples.map((tuple) =>
				this.storage.put(
					this.tupleKey(type, id, tuple.subject, tuple.relation),
					JSON.stringify({
						expires_at: tuple.expires_at ?? null,
					})
				)
			)
		);
	}

	async delete(type: string, id: string): Promise<void> {
		await this.deleteByPrefix(this.resourcePrefix(type, id));
	}

	async addTuple(type: string, id: string, tuple: RelationTupleData): Promise<void> {
		await this.storage.put(
			this.tupleKey(type, id, tuple.subject, tuple.relation),
			JSON.stringify({
				expires_at: tuple.expires_at ?? null,
			})
		);
	}

	async removeTuple(type: string, id: string, subject: string, relation: string): Promise<void> {
		await this.storage.delete(this.tupleKey(type, id, subject, relation));
	}

	async listByType(type: string): Promise<{ id: string; data: RelationshipData }[]> {
		const listResult = await this.storage.list({ prefix: this.typePrefix(type) });
		const tuples = await Promise.all(
			listResult.keys.map(async ({ name }) => {
				const parsed = this.parseTupleKey(name);
				if (!parsed || parsed.type !== type) return null;
				const value = await this.getTupleValue(name);
				if (!value) return null;
				return {
					id: parsed.id,
					tuple: RelationTupleDataSchema.parse({
						subject: parsed.subject,
						relation: parsed.relation,
						expires_at: value.expires_at,
					}),
				};
			})
		);

		const byId = new Map<string, RelationTupleData[]>();
		for (const entry of tuples) {
			if (!entry) continue;
			const existing = byId.get(entry.id) ?? [];
			existing.push(entry.tuple);
			byId.set(entry.id, existing);
		}

		return Array.from(byId.entries()).map(([id, relTuples]) => ({
			id,
			data: { tuples: relTuples },
		}));
	}

	async listAll(): Promise<{ type: string; id: string; data: RelationshipData }[]> {
		const listResult = await this.storage.list({ prefix: this.tuplePrefix });
		const tuples = await Promise.all(
			listResult.keys.map(async ({ name }) => {
				const parsed = this.parseTupleKey(name);
				if (!parsed) return null;
				const value = await this.getTupleValue(name);
				if (!value) return null;
				return {
					type: parsed.type,
					id: parsed.id,
					tuple: RelationTupleDataSchema.parse({
						subject: parsed.subject,
						relation: parsed.relation,
						expires_at: value.expires_at,
					}),
				};
			})
		);

		const byResource = new Map<string, { type: string; id: string; tuples: RelationTupleData[] }>();
		for (const entry of tuples) {
			if (!entry) continue;
			const resourceKey = `${entry.type}:${entry.id}`;
			const existing = byResource.get(resourceKey) ?? {
				type: entry.type,
				id: entry.id,
				tuples: [],
			};
			existing.tuples.push(entry.tuple);
			byResource.set(resourceKey, existing);
		}

		return Array.from(byResource.values()).map((entry) => ({
			type: entry.type,
			id: entry.id,
			data: { tuples: entry.tuples },
		}));
	}
}

export class RelationDefinitionRepository implements IRelationDefinitionRepository {
	private readonly prefix: string;

	constructor(private readonly storage: IStorage, private readonly projectId: string) {
		this.prefix = `project:${projectId}:relation_def:`;
	}

	private key(type: string, relation: string): string {
		return `${this.prefix}${type}:${relation}`;
	}

	async get(type: string, relation: string): Promise<RelationDefinitionData | null> {
		const data = await this.storage.get(this.key(type, relation));
		if (!data) return null;
		return RelationDefinitionDataSchema.parse(JSON.parse(data));
	}

	async save(type: string, relation: string, data: RelationDefinitionData): Promise<void> {
		await this.storage.put(this.key(type, relation), JSON.stringify(data));
	}

	async delete(type: string, relation: string): Promise<void> {
		await this.storage.delete(this.key(type, relation));
	}

	async listByType(type: string): Promise<{ relation: string; data: RelationDefinitionData }[]> {
		const keyPrefix = `${this.prefix}${type}:`;
		const listResult = await this.storage.list({ prefix: keyPrefix });
		const results: { relation: string; data: RelationDefinitionData }[] = [];

		await Promise.all(
			listResult.keys.map(async (keyObj) => {
				const relation = keyObj.name.substring(keyPrefix.length);
				const dataStr = await this.storage.get(keyObj.name);
				if (dataStr) {
					results.push({ relation, data: RelationDefinitionDataSchema.parse(JSON.parse(dataStr)) });
				}
			})
		);

		return results;
	}
}

export class GroupMembershipRepository implements IGroupMembershipRepository {
	private readonly userGroupPrefix: string;
	private readonly groupMemberPrefix: string;

	constructor(private readonly storage: IStorage, private readonly projectId: string) {
		this.userGroupPrefix = `project:${projectId}:group_idx:user:`;
		this.groupMemberPrefix = `project:${projectId}:group_idx:group:`;
	}

	private encode(input: string): string {
		return encodeURIComponent(input);
	}

	private decode(input: string): string {
		return decodeURIComponent(input);
	}

	private userGroupKey(userId: string, group: string): string {
		return `${this.userGroupPrefix}${this.encode(userId)}:${this.encode(group)}`;
	}

	private groupMemberKey(group: string, userId: string): string {
		return `${this.groupMemberPrefix}${this.encode(group)}:${this.encode(userId)}`;
	}

	private userGroupsPrefix(userId: string): string {
		return `${this.userGroupPrefix}${this.encode(userId)}:`;
	}

	private groupMembersPrefix(group: string): string {
		return `${this.groupMemberPrefix}${this.encode(group)}:`;
	}

	async getGroups(userId: string): Promise<string[]> {
		const listResult = await this.storage.list({ prefix: this.userGroupsPrefix(userId) });
		const groups = listResult.keys.map(({ name }) => {
			const encodedGroup = name.substring(this.userGroupsPrefix(userId).length);
			return `group:${this.decode(encodedGroup)}`;
		});
		return GroupMembershipDataSchema.parse(groups);
	}

	async addToGroup(userId: string, group: string): Promise<void> {
		await Promise.all([
			this.storage.put(this.userGroupKey(userId, group), '1'),
			this.storage.put(this.groupMemberKey(group, userId), '1'),
		]);
	}

	async removeFromGroup(userId: string, group: string): Promise<void> {
		await Promise.all([
			this.storage.delete(this.userGroupKey(userId, group)),
			this.storage.delete(this.groupMemberKey(group, userId)),
		]);
	}

	async getGroupMembers(group: string): Promise<string[]> {
		const prefix = this.groupMembersPrefix(group);
		const listResult = await this.storage.list({ prefix });
		return listResult.keys.map(({ name }) => this.decode(name.substring(prefix.length)));
	}

	async listAllGroups(): Promise<string[]> {
		const listResult = await this.storage.list({ prefix: this.groupMemberPrefix });
		const uniqueGroups = new Set<string>();

		for (const { name } of listResult.keys) {
			const raw = name.substring(this.groupMemberPrefix.length);
			const [encodedGroup] = raw.split(':');
			if (!encodedGroup) continue;
			const groupSubject = `group:${this.decode(encodedGroup)}` as Subject;
			const parsed = parseSubject(groupSubject);
			if (parsed.type === 'group') {
				uniqueGroups.add(parsed.id);
			}
		}

		return Array.from(uniqueGroups);
	}
}
