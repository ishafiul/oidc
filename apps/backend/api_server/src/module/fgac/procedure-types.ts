import type {
  FGACConfig,
  InferDocType,
  InferPermission,
  InferRelation,
  IPermissionChecker,
} from './adapters/IPermissionAdapter';
import type { PermissionServiceEnv } from './services/permission-service.factory';

export interface PermissionServiceFactory<TConfig extends FGACConfig> {
  createPermissionService(env: PermissionServiceEnv<TConfig>): IPermissionChecker<TConfig>;
}

export type ResourceTypeExtractor<TConfig extends FGACConfig> =
  | InferDocType<TConfig>
  | ((req: Request) => InferDocType<TConfig> | undefined);

export type ResourceIdExtractor = string | ((req: Request) => string | undefined);

export interface PermissionContext<TConfig extends FGACConfig> {
  env: PermissionServiceEnv<TConfig>;
  get: <T = unknown>(key: string) => T;
  set: (key: string, value: unknown) => void;
  req: {
    raw: Request;
    header: (name: string) => string | null | undefined;
  };
}

export type ProcedurePermissions<TConfig extends FGACConfig> =
  | {
      relation: InferRelation<TConfig>;
      anyOf?: never;
      allOf?: never;
      anyRelation?: never;
      allRelations?: never;
      resourceType: ResourceTypeExtractor<TConfig>;
      resourceId?: ResourceIdExtractor;
    }
  | {
      relation?: never;
      anyOf: InferPermission<TConfig>[];
      allOf?: never;
      anyRelation?: never;
      allRelations?: never;
      resourceType: ResourceTypeExtractor<TConfig>;
      resourceId?: ResourceIdExtractor;
    }
  | {
      relation?: never;
      anyOf?: never;
      allOf: InferPermission<TConfig>[];
      anyRelation?: never;
      allRelations?: never;
      resourceType: ResourceTypeExtractor<TConfig>;
      resourceId?: ResourceIdExtractor;
    }
  | {
      relation?: never;
      anyOf?: never;
      allOf?: never;
      anyRelation: InferRelation<TConfig>[];
      allRelations?: never;
      resourceType: ResourceTypeExtractor<TConfig>;
      resourceId?: ResourceIdExtractor;
    }
  | {
      relation?: never;
      anyOf?: never;
      allOf?: never;
      anyRelation?: never;
      allRelations: InferRelation<TConfig>[];
      resourceType: ResourceTypeExtractor<TConfig>;
      resourceId?: ResourceIdExtractor;
    };
