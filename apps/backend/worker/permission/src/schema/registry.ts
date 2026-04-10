import { z } from 'zod';
import {
	SchemaConfig,
	SchemaDefinition,
	createDocTypeSchema,
	createRelationSchema,
	createPermissionSchema,
	validateProjectId,
} from './types';

export class SchemaRegistry<
	TDocTypes extends readonly string[] = readonly string[],
	TRelations extends readonly string[] = readonly string[],
	TPermissions extends readonly string[] = readonly string[],
> {
	private readonly _definition: SchemaDefinition<TDocTypes, TRelations, TPermissions>;

	private constructor(definition: SchemaDefinition<TDocTypes, TRelations, TPermissions>) {
		this._definition = definition;
	}

	static create<
		const TDocTypes extends readonly [string, ...string[]],
		const TRelations extends readonly [string, ...string[]],
		const TPermissions extends readonly [string, ...string[]],
	>(config: SchemaConfig<TDocTypes, TRelations, TPermissions>): SchemaRegistry<TDocTypes, TRelations, TPermissions> {
		validateProjectId(config.projectId);

		const docTypeSchema = createDocTypeSchema(config.docTypes);
		const relationSchema = createRelationSchema(config.relations);
		const permissionSchema = createPermissionSchema(config.permissions);

		return new SchemaRegistry({
			projectId: config.projectId,
			docTypes: config.docTypes,
			relations: config.relations,
			permissions: config.permissions,
			docTypeSchema,
			relationSchema,
			permissionSchema,
			encryptionKey: config.encryptionKey,
		});
	}

	get projectId(): string {
		return this._definition.projectId;
	}

	get docTypes(): TDocTypes {
		return this._definition.docTypes;
	}

	get relations(): TRelations {
		return this._definition.relations;
	}

	get permissions(): TPermissions {
		return this._definition.permissions;
	}

	get docTypeSchema(): z.ZodType<string> {
		return this._definition.docTypeSchema as z.ZodType<string>;
	}

	get relationSchema(): z.ZodType<string> {
		return this._definition.relationSchema as z.ZodType<string>;
	}

	get permissionSchema(): z.ZodType<string> {
		return this._definition.permissionSchema as z.ZodType<string>;
	}

	get encryptionKey(): string | undefined {
		return this._definition.encryptionKey;
	}

	validateDocType(docType: string): docType is TDocTypes[number] {
		return this._definition.docTypes.includes(docType);
	}

	validateRelation(relation: string): relation is TRelations[number] {
		return this._definition.relations.includes(relation);
	}

	validatePermission(permission: string): permission is TPermissions[number] {
		return this._definition.permissions.includes(permission);
	}

	createSubjectSchema() {
		return z.union([
			z.string().regex(/^user:[a-zA-Z0-9_-]+$/),
			z.string().regex(/^group:[a-zA-Z0-9_-]+$/),
			z.string().regex(/^api_key:[a-zA-Z0-9_-]+$/),
		]);
	}

	createRelationDefinitionSchema() {
		return z.object({
			permissions: z.array(this._definition.permissionSchema),
			inherits: z.array(z.string().min(1)),
		});
	}

	createRelationTupleSchema() {
		const subjectSchema = this.createSubjectSchema();
		return z.object({
			subject: subjectSchema,
			relation: z.string().min(1),
			expires_at: z.number().optional(),
		});
	}

	createRelationshipTuplesSchema() {
		return z.object({
			tuples: z.array(this.createRelationTupleSchema()),
		});
	}
}

export type AnySchemaRegistry = SchemaRegistry<readonly string[], readonly string[], readonly string[]>;
