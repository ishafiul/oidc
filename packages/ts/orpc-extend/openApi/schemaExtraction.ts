import { OpenAPI } from '@orpc/openapi';
import { logger } from '../logger';

type JsonSchema = OpenAPI.SchemaObject | OpenAPI.ReferenceObject;
type ReferenceObject = OpenAPI.ReferenceObject;
type MediaTypeObject = OpenAPI.MediaTypeObject;
type RequestBodyObject = OpenAPI.RequestBodyObject;
type ResponseObject = OpenAPI.ResponseObject;
type OpenApiDocument = OpenAPI.Document;
type HttpMethod = OpenAPI.HttpMethods;

interface ParameterObject extends Omit<OpenAPI.ParameterObject, 'schema'> {
  schema?: JsonSchema;
}

interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: OpenAPI.ExternalDocumentationObject;
  operationId?: string;
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: ReferenceObject | RequestBodyObject;
  responses?: Record<string, ReferenceObject | ResponseObject>;
  callbacks?: Record<string, ReferenceObject | OpenAPI.CallbackObject>;
  deprecated?: boolean;
  security?: OpenAPI.SecurityRequirementObject[];
  servers?: OpenAPI.ServerObject[];

  [key: string]: unknown;
}

type SchemaRegistry = Record<string, JsonSchema>;

export class SchemaExtractionService {
  private static readonly HTTP_METHODS_SET = new Set<string>([
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
    'trace',
  ]);

  private static readonly COMPOSITE_SCHEMA_KEYS = ['anyOf', 'oneOf', 'allOf'] as const;

  private static readonly SINGLE_SCHEMA_KEYS = ['not', 'contains', 'propertyNames'] as const;

  extractTitledSchemasToComponents(document: OpenApiDocument): OpenApiDocument {
    if (!this.isNonNullObject(document) || typeof document !== 'object') {
      throw new Error('Invalid OpenAPI document: document must be an object');
    }

    const schemaRegistry = document.components?.schemas ?? {};

    if (document.paths && this.isNonNullObject(document.paths)) {
      for (const path of Object.keys(document.paths)) {
        const pathItem = document.paths[path];
        if (!pathItem || !this.isNonNullObject(pathItem)) continue;

        logger.debug(`Processing schemas for path: ${path}`);

        for (const method of Object.keys(pathItem)) {
          if (this.isHttpMethod(method)) {
            const operation = pathItem[method];
            if (operation && this.isNonNullObject(operation)) {
              this.processOperationSchemas(operation, schemaRegistry);
            }
          }
        }
      }
    }

    return document;
  }


  private areStructurallyEqual(schemaA: JsonSchema, schemaB: JsonSchema): boolean {
    if (schemaA === schemaB) return true;
    if (this.isSchemaObject(schemaA) && this.isSchemaObject(schemaB)) {
      if (schemaA.title !== schemaB.title) return false;
      if (schemaA.type !== schemaB.type) return false;
    }
    if ('$ref' in schemaA && '$ref' in schemaB) {
      return schemaA.$ref === schemaB.$ref;
    }
    if ('$ref' in schemaA || '$ref' in schemaB) return false;
    try {
      return JSON.stringify(schemaA) === JSON.stringify(schemaB);
    } catch {
      return false;
    }
  }

  private deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.deepClone(item)) as T;
    }
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  private isNonNullObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isSchemaObject(schema: JsonSchema): schema is OpenAPI.SchemaObject {
    return this.isNonNullObject(schema) && !('$ref' in schema);
  }

  private isParameterObject(param: ParameterObject | ReferenceObject): param is ParameterObject {
    return this.isNonNullObject(param) && !('$ref' in param);
  }

  private isHttpMethod(method: string): method is HttpMethod {
    return SchemaExtractionService.HTTP_METHODS_SET.has(method);
  }


  private processSchemaArray(schemas: JsonSchema[], registry: SchemaRegistry): JsonSchema[] {
    return schemas.map((schema) => this.extractAndRegisterTitledSchemas(schema, registry));
  }

  private isJsonSchema(value: unknown): value is JsonSchema {
    if (!this.isNonNullObject(value)) return false;
    if ('$ref' in value) return true;
    return this.isSchemaObject(value);
  }

  private toJsonSchema(value: unknown): JsonSchema {
    if (this.isJsonSchema(value)) {
      return value;
    }
    throw new Error('Invalid schema object');
  }

  private getNestedSchema(obj: Record<string, unknown>, key: string): JsonSchema | undefined {
    const value = obj[key];
    if (this.isJsonSchema(value)) {
      return value;
    }
    return undefined;
  }

  private setNestedSchema(obj: Record<string, unknown>, key: string, schema: JsonSchema): void {
    obj[key] = schema;
  }

  private getNestedSchemaArray(obj: Record<string, unknown>, key: string): JsonSchema[] | undefined {
    const value = obj[key];
    if (!Array.isArray(value)) {
      return undefined;
    }
    const schemas: JsonSchema[] = [];
    for (const item of value) {
      if (this.isJsonSchema(item)) {
        schemas.push(item);
      } else {
        return undefined;
      }
    }
    return schemas;
  }

  private setNestedSchemaArray(obj: Record<string, unknown>, key: string, schemas: JsonSchema[]): void {
    obj[key] = schemas;
  }

  private extractAndRegisterTitledSchemas(schema: JsonSchema, registry: SchemaRegistry): JsonSchema {
    if (!this.isSchemaObject(schema)) return schema;

    const schemaTitle = typeof schema.title === 'string' ? schema.title.trim() : '';
    const cloned = this.deepClone(schema);
    const processedSchema: Record<string, unknown> = this.isNonNullObject(cloned) ? cloned : {};

    const propertiesValue = processedSchema.properties;
    if (propertiesValue && this.isNonNullObject(propertiesValue)) {
      const propertyKeys = Object.keys(propertiesValue);
      for (const propertyName of propertyKeys) {
        const prop = this.getNestedSchema(propertiesValue, propertyName);
        if (prop) {
          const processedProp = this.extractAndRegisterTitledSchemas(prop, registry);
          if (this.isJsonSchema(processedProp)) {
            propertiesValue[propertyName] = processedProp;
          }
        }
      }
    }

    const items = this.getNestedSchema(processedSchema, 'items');
    if (items && !Array.isArray(items)) {
      this.setNestedSchema(processedSchema, 'items', this.extractAndRegisterTitledSchemas(items, registry));
    }

    const prefixItems = this.getNestedSchemaArray(processedSchema, 'prefixItems');
    if (prefixItems) {
      this.setNestedSchemaArray(
        processedSchema,
        'prefixItems',
        this.processSchemaArray(prefixItems, registry),
      );
    }

    for (const compositeKey of SchemaExtractionService.COMPOSITE_SCHEMA_KEYS) {
      const compositeSchemas = this.getNestedSchemaArray(processedSchema, compositeKey);
      if (compositeSchemas) {
        this.setNestedSchemaArray(
          processedSchema,
          compositeKey,
          this.processSchemaArray(compositeSchemas, registry),
        );
      }
    }

    for (const schemaKey of SchemaExtractionService.SINGLE_SCHEMA_KEYS) {
      const nestedSchema = this.getNestedSchema(processedSchema, schemaKey);
      if (nestedSchema) {
        this.setNestedSchema(
          processedSchema,
          schemaKey,
          this.extractAndRegisterTitledSchemas(nestedSchema, registry),
        );
      }
    }

    const additionalProperties = this.getNestedSchema(processedSchema, 'additionalProperties');
    if (additionalProperties) {
      this.setNestedSchema(
        processedSchema,
        'additionalProperties',
        this.extractAndRegisterTitledSchemas(additionalProperties, registry),
      );
    }

    if (schemaTitle) {
      const finalSchema = this.toJsonSchema(processedSchema);
      if (!registry[schemaTitle]) {
        registry[schemaTitle] = finalSchema;
        // logger.debug(`Registered schema: ${schemaTitle}`);
      } else if (!this.areStructurallyEqual(registry[schemaTitle], finalSchema)) {
        logger.error(`Schema conflict detected for title '${schemaTitle}'`, {
          existing: registry[schemaTitle],
          new: finalSchema
        });
        throw new Error(`Conflicting schema title '${schemaTitle}' with differing structure`);
      }
      return { $ref: `#/components/schemas/${schemaTitle}` };
    }

    return this.toJsonSchema(processedSchema);
  }

  private processSchemasInMediaContent(
    content: Record<string, MediaTypeObject> | undefined,
    registry: SchemaRegistry,
  ): void {
    if (!content) return;

    for (const mediaType of Object.keys(content)) {
      const mediaContent = content[mediaType];
      if (mediaContent?.schema) {
        mediaContent.schema = this.extractAndRegisterTitledSchemas(mediaContent.schema, registry);
      }
    }
  }

  private processOperationSchemas(operation: OperationObject, registry: SchemaRegistry): void {
    if (!this.isNonNullObject(operation)) return;

    const requestBody = operation.requestBody;
    if (requestBody && this.isNonNullObject(requestBody) && !('$ref' in requestBody)) {
      const content = requestBody.content;
      if (content) {
        this.processSchemasInMediaContent(content, registry);
      }
    }

    if (operation.responses) {
      for (const statusCode of Object.keys(operation.responses)) {
        const response = operation.responses[statusCode];
        if (response && this.isNonNullObject(response) && !('$ref' in response)) {
          const content = response.content;
          if (content) {
            this.processSchemasInMediaContent(content, registry);
          }
        }
      }
    }

    if (Array.isArray(operation.parameters)) {
      for (const parameter of operation.parameters) {
        if (this.isParameterObject(parameter) && parameter.schema) {
          parameter.schema = this.extractAndRegisterTitledSchemas(parameter.schema, registry);
        }
      }
    }
  }
}

