import { IEncryption } from '../encryption/interfaces';

export interface IStorage {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

export interface StorageOptions {
	encryption?: IEncryption;
}

export interface RelationTupleData {
	subject: string;
	relation: string;
	expires_at?: number;
}

export interface RelationshipData {
	tuples: RelationTupleData[];
}

export interface RelationDefinitionData {
	permissions: string[];
	inherits: string[];
}

export interface IRelationshipRepository {
	get(type: string, id: string): Promise<RelationshipData>;
	save(type: string, id: string, data: RelationshipData): Promise<void>;
	delete(type: string, id: string): Promise<void>;
	addTuple(type: string, id: string, tuple: RelationTupleData): Promise<void>;
	removeTuple(type: string, id: string, subject: string, relation: string): Promise<void>;
	listByType(type: string): Promise<{ id: string; data: RelationshipData }[]>;
	listAll(): Promise<{ type: string; id: string; data: RelationshipData }[]>;
}

export interface IRelationDefinitionRepository {
	get(type: string, relation: string): Promise<RelationDefinitionData | null>;
	save(type: string, relation: string, data: RelationDefinitionData): Promise<void>;
	delete(type: string, relation: string): Promise<void>;
	listByType(type: string): Promise<{ relation: string; data: RelationDefinitionData }[]>;
}

export interface IGroupMembershipRepository {
	getGroups(subject: string): Promise<string[]>;
	addToGroup(subject: string, group: string): Promise<void>;
	removeFromGroup(subject: string, group: string): Promise<void>;
	getGroupMembers(group: string): Promise<string[]>;
	listAllGroups(): Promise<string[]>;
}
