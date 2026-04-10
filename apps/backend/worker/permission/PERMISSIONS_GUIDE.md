# How to Create New Permissions

This guide explains how to add new permissions to the FGAC (Fine-Grained Access Control) system.

## Architecture Notes (Current)

- **Tuple-first KV model**: relations are stored as individual tuple keys (`subject + relation + resource`) instead of a single mutable JSON document per resource. This removes read-modify-write race conditions during grant/revoke.
- **Indexed group membership**: membership is stored with both user->group and group->user indexes, so listing user groups and group members is direct and efficient.
- **Type-safe contracts**: request/response DTOs and internal manager APIs are strongly typed and validated with Zod.
- **Authenticated checks**: permission-check routes are bound to the authenticated user context and do not accept caller-provided `userId` for check operations.

## Overview

The permission system works in two steps:
1. **Define permissions** in the configuration (declares what permissions exist)
2. **Map permissions to relations** using `defineRelation` (assigns permissions to relations)

## Step 1: Add Permission to Configuration

Edit the config file: `shared/permissions/src/config/fgac.config.ts`

```typescript
export const FGAC_CONFIG = {
  docTypes: ['user'] as const,
  relations: ['viewer', 'editor', 'owner', 'member', 'admin'] as const,
  permissions: ['user', 'read', 'write', 'admin', 'superadmin', 'your-new-permission'] as const, // Add here
  projectId: 'house-rent',
} as const;
```

**Example:** To add a `delete` permission:
```typescript
permissions: ['user', 'read', 'write', 'admin', 'superadmin', 'delete'] as const,
```

## Step 2: Map Permissions to Relations

After defining permissions, you need to map them to relations using the `defineRelation` API. This tells the system which permissions each relation grants.

### Using the API

```typescript
// Example: Map 'delete' permission to 'editor' relation
await permissionManager.defineRelation({
  type: 'user',           // Document type
  relation: 'editor',      // Relation name
  permissions: ['read', 'write', 'delete'], // Permissions this relation grants
  inherits: ['viewer']     // Optional: inherit permissions from other relations
});
```

### Example: Complete Setup

```typescript
// 1. Define 'viewer' relation with 'read' permission
await permissionManager.defineRelation({
  type: 'user',
  relation: 'viewer',
  permissions: ['read'],
  inherits: []
});

// 2. Define 'editor' relation with 'read' and 'write' permissions
//    and inherit from 'viewer'
await permissionManager.defineRelation({
  type: 'user',
  relation: 'editor',
  permissions: ['write'],
  inherits: ['viewer']  // Inherits 'read' from viewer
});

// 3. Define 'admin' relation with all permissions
await permissionManager.defineRelation({
  type: 'user',
  relation: 'admin',
  permissions: ['admin', 'superadmin'],
  inherits: ['editor']  // Inherits 'read' and 'write' from editor
});
```

## Step 3: Grant Relations to Users

After defining relations, grant them to users:

```typescript
// Grant 'editor' relation to user:123 on resource user:456
await permissionManager.grantRelation({
  subject: 'user:123',
  relation: 'editor',
  resource: { type: 'user', id: '456' }
});
```

## Step 4: Check Permissions

Check if a user has a permission:

```typescript
// Check if user has 'delete' permission
const canDelete = await permissionManager.can(
  'user:123',
  'delete',
  { type: 'user', id: '456' }
);

// Check if user has any of multiple permissions
const canAny = await permissionManager.canAny(
  'user:123',
  ['read', 'write'],
  { type: 'user', id: '456' }
);

// Check if user has all permissions
const canAll = await permissionManager.canAll(
  'user:123',
  ['read', 'write'],
  { type: 'user', id: '456' }
);
```

## Permission Inheritance

Relations can inherit permissions from other relations:

```typescript
// 'admin' inherits all permissions from 'editor'
await permissionManager.defineRelation({
  type: 'user',
  relation: 'admin',
  permissions: ['admin'],
  inherits: ['editor']  // Automatically gets 'read' and 'write' from editor
});
```

## Complete Example: Adding a 'delete' Permission

```typescript
// 1. Update config
export const FGAC_CONFIG = {
  docTypes: ['user'] as const,
  relations: ['viewer', 'editor', 'owner', 'member', 'admin'] as const,
  permissions: ['user', 'read', 'write', 'admin', 'superadmin', 'delete'] as const,
  projectId: 'house-rent',
} as const;

// 2. Map 'delete' to 'editor' relation
await permissionManager.defineRelation({
  type: 'user',
  relation: 'editor',
  permissions: ['write', 'delete'],  // Add 'delete' here
  inherits: ['viewer']
});

// 3. Grant relation to user
await permissionManager.grantRelation({
  subject: 'user:123',
  relation: 'editor',
  resource: { type: 'user', id: '456' }
});

// 4. Check permission
const canDelete = await permissionManager.can(
  'user:123',
  'delete',
  { type: 'user', id: '456' }
); // Returns true
```

## Important Notes

1. **Permissions must be defined in config first** - You cannot use a permission that isn't in the `permissions` array
2. **Relations must be defined** - Use `defineRelation` to map permissions to relations before granting
3. **Type safety** - TypeScript will enforce that only defined permissions can be used
4. **Inheritance is transitive** - If A inherits from B, and B inherits from C, A gets permissions from both B and C

## API Reference

### `defineRelation(request)`
Maps permissions to a relation.

**Request:**
```typescript
{
  type: string;              // Document type (e.g., 'user')
  relation: string;           // Relation name (e.g., 'editor')
  permissions: string[];      // Array of permission names
  inherits?: string[];        // Optional: relations to inherit from
}
```

**Returns:** `{ ok: boolean }`

### `can(userId, permission, resource)`
Checks if a user has a specific permission.

**Parameters:**
- `userId`: User ID (e.g., 'user:123')
- `permission`: Permission name (e.g., 'delete')
- `resource`: `{ type: string, id: string }`

**Returns:** `Promise<boolean>`

### `canAny(userId, permissions, resource)`
Checks if a user has any of the specified permissions.

**Returns:** `Promise<boolean>`

### `canAll(userId, permissions, resource)`
Checks if a user has all of the specified permissions.

**Returns:** `Promise<{ allAllowed: boolean; missing: string[] }>`
