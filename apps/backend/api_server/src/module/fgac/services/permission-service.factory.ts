/**
 * Permission Service Factory
 *
 * Creates permission services with proper adapter injection.
 * Central place to configure the FGAC system.
 */

import type { Service } from '@cloudflare/workers-types';
import CloudflareFGACAdapter from '../adapters/CloudflareFGACAdapter';
import type { FGACConfig, IFGACAdapter } from '../adapters/IPermissionAdapter';
import { FGACPermissionService } from './fgac-permission.service';
import { PermissionManagementService } from './permission-management.service';
import { FGACService } from 'permission-manager-worker/src';

/**
 * Environment interface with the FGAC service binding
 */
export interface PermissionServiceEnv<TConfig extends FGACConfig> {
  PERMISSION_MANAGER: Service<FGACService<
    TConfig['docTypes'],
    TConfig['relations'],
    TConfig['permissions']
  >>;
  JWT_SECRET?: string;
  SYSTEM_ADMIN_USER_ID?: string;
}

/**
 * Options for creating services
 */
export interface CreateServiceOptions<TConfig extends FGACConfig> {
  adapter?: IFGACAdapter<TConfig>;
}

/**
 * Create a Cloudflare FGAC adapter from environment and config
 */
export function createAdapter<TConfig extends FGACConfig>(
  env: PermissionServiceEnv<TConfig>,
  config: TConfig
): CloudflareFGACAdapter<TConfig> {
  if (!env.PERMISSION_MANAGER) {
    throw new Error('PERMISSION_MANAGER service binding is not available in environment');
  }
  return new CloudflareFGACAdapter(env.PERMISSION_MANAGER, config);
}

/**
 * Create a permission checking service
 */
export function createPermissionService<TConfig extends FGACConfig>(
  env: PermissionServiceEnv<TConfig>,
  config: TConfig,
  options?: CreateServiceOptions<TConfig>
): FGACPermissionService<TConfig> {
  const adapter = options?.adapter ?? createAdapter(env, config);
  return new FGACPermissionService(adapter);
}

/**
 * Create a permission management service with lazy auto-initialization
 */
export function createPermissionManagementService<TConfig extends FGACConfig>(
  env: PermissionServiceEnv<TConfig>,
  config: TConfig,
  options?: CreateServiceOptions<TConfig>
): PermissionManagementService<TConfig> {
  const adapter = options?.adapter ?? createAdapter(env, config);
  const systemAdminUserId = env.SYSTEM_ADMIN_USER_ID;
  return new PermissionManagementService(adapter, config, systemAdminUserId);
}
