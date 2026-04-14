import { describe, expect, it } from 'vitest';

import { hasFgacPermission, matchesFgacGrant, parseFgacPermissions, parseFgacRelations } from '../src/claims';

describe('parseFgacRelations', () => {
	it('parses snake_case tuples', () => {
		const rels = parseFgacRelations({
			fgac_relations: [
				{ resource_type: 'blog', resource_id: '1', relation: 'admin' },
				{ resource_type: 'x', resource_id: 'y', relation: 'z' },
			],
		});
		expect(rels).toHaveLength(2);
		expect(matchesFgacGrant(rels, 'blog', '1', 'admin')).toBe(true);
		expect(matchesFgacGrant(rels, 'blog', '2', 'admin')).toBe(false);
		expect(matchesFgacGrant(rels, 'blog', 'any', 'admin')).toBe(false);
	});

	it('wildcard resource_id', () => {
		const rels = parseFgacRelations({
			fgac_relations: [{ resource_type: 'doc', resource_id: '*', relation: 'viewer' }],
		});
		expect(matchesFgacGrant(rels, 'doc', 'anything', 'viewer')).toBe(true);
	});
});

describe('parseFgacPermissions', () => {
	it('parses permission entries and de-duplicates permissions', () => {
		const perms = parseFgacPermissions({
			fgac_permissions: [
				{ resource_type: 'blog', resource_id: '1', permissions: ['read', 'write', 'read'] },
				{ resource_type: 'doc', resource_id: '*', permissions: ['read'] },
			],
		});
		expect(perms).toHaveLength(2);
		expect(hasFgacPermission(perms, 'blog', '1', 'write')).toBe(true);
		expect(hasFgacPermission(perms, 'blog', '1', 'delete')).toBe(false);
		expect(hasFgacPermission(perms, 'doc', 'anything', 'read')).toBe(true);
	});
});
