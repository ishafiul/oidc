import { z } from 'zod';

export const SubjectSchema = z.union([
	z.string().regex(/^user:[a-zA-Z0-9_-]+$/),
	z.string().regex(/^group:[a-zA-Z0-9_-]+$/),
	z.string().regex(/^api_key:[a-zA-Z0-9_-]+$/),
]).meta({
	title: "Subject",
	description: "Represents a subject in the permission system (user, group, or api_key)",
});

export const ObjectIdSchema = z.string().min(1).meta({
	title: "ObjectId",
	description: "Represents a resource object identifier",
});

export const RelationSchema = z.string().min(1).meta({
	title: "Relation",
	description: "Represents a relation name in the permission system",
});

export function createRelationTupleSchema(subjectSchema: z.ZodType = SubjectSchema) {
	return z.object({
		subject: subjectSchema,
		relation: RelationSchema,
		expires_at: z.number().optional(),
	}).meta({
		title: "RelationTuple",
		description: "Represents a relation tuple connecting a subject to a relation with optional expiration",
	});
}

export function createRelationshipTuplesSchema(subjectSchema: z.ZodType = SubjectSchema) {
	return z.object({
		tuples: z.array(createRelationTupleSchema(subjectSchema)),
	}).meta({
		title: "RelationshipTuples",
		description: "Represents a collection of relation tuples",
	});
}

export function createRelationDefinitionSchema<T extends z.ZodType<string>>(
	permissionSchema: T
) {
	return z.object({
		permissions: z.array(permissionSchema),
		inherits: z.array(RelationSchema),
	}).meta({
		title: "RelationDefinition",
		description: "Defines a relation with its associated permissions and inherited relations",
	});
}

export const BaseRelationTupleSchema = createRelationTupleSchema();
export const BaseRelationshipTuplesSchema = createRelationshipTuplesSchema();

export type Subject = z.infer<typeof SubjectSchema>;
export type ObjectId = z.infer<typeof ObjectIdSchema>;
export type Relation = z.infer<typeof RelationSchema>;

export type RelationTuple = {
	subject: string;
	relation: string;
	expires_at?: number;
};

export type RelationshipTuples = {
	tuples: RelationTuple[];
};

export type RelationDefinition<TPermission extends string = string> = {
	permissions: TPermission[];
	inherits: string[];
};
