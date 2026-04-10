import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { resolveContractProcedures, Router } from '@orpc/server';
import z from 'zod';
import { SchemaExtractionService } from './schemaExtraction';

const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
});

export type OpenApiInfo = {
    title: string;
    version: string;
    description?: string;
};

export async function generateOpenApiSpec(args: {
    router: Router<any, any>;
    info: OpenApiInfo;
}) {

    const { router, info } = args;
    const commonSchemas: Record<string, { strategy: 'input'; schema: z.ZodTypeAny }> = {};
    await resolveContractProcedures({ path: [], router: router }, (traverseOptions) => {
        if (traverseOptions.contract['~orpc'].route.path) {
            const contract = traverseOptions.contract['~orpc'];
            const isDetailedView = contract.route.inputStructure === 'detailed';
            if (contract.inputSchema && !isDetailedView) {
                throw new Error(
                    `Input structure must be set to "detailed" for route: ${contract.route.path}. This is required to correctly extract the body schema.`
                );
            }
        }
    });

    const document = await generator.generate(router, {
        info,
        commonSchemas,
        // TODO: Security schema
    });
    const schemaExtractionService = new SchemaExtractionService();
    return schemaExtractionService.extractTitledSchemasToComponents(document);
}
