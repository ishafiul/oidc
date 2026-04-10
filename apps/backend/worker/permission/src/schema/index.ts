export { SchemaRegistry } from './registry';
export type { AnySchemaRegistry } from './registry';

export {
	validateProjectId,
	createDocTypeSchema,
	createRelationSchema,
	createPermissionSchema,
	parseSubject,
	createSubject,
} from './types';

export type {
	SchemaConfig,
	SchemaDefinition,
	InferDocTypes,
	InferRelations,
	InferPermissions,
	SubjectType,
	SubjectPattern,
} from './types';
