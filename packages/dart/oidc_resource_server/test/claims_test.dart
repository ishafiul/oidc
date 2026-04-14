import 'package:oidc_resource_server/oidc_resource_server.dart';
import 'package:test/test.dart';

void main() {
  group('matchesFgacGrant', () {
    test('exact resource id', () {
      final rels = [
        FgacRelationClaim(resourceType: 'blog_post', resourceId: 'a1', relation: 'editor'),
      ];
      expect(matchesFgacGrant(rels, 'blog_post', 'a1', relation: 'editor'), isTrue);
      expect(matchesFgacGrant(rels, 'blog_post', 'a2', relation: 'editor'), isFalse);
    });

    test('wildcard resource id', () {
      final rels = [
        FgacRelationClaim(resourceType: 'blog_post', resourceId: '*', relation: 'editor'),
      ];
      expect(matchesFgacGrant(rels, 'blog_post', 'any-id', relation: 'editor'), isTrue);
      expect(matchesFgacGrant(rels, 'blog_post', 'any-id', relation: 'viewer'), isFalse);
    });
  });

  group('fgac_permissions', () {
    test('parse and match explicit permission claim', () {
      final claims = parseFgacPermissions({
        'fgac_permissions': [
          {
            'resource_type': 'doc',
            'resource_id': 'x',
            'permissions': ['read', 'write', 'read'],
          },
        ],
      });

      expect(hasFgacPermission(claims, 'read', 'doc', 'x'), isTrue);
      expect(hasFgacPermission(claims, 'delete', 'doc', 'x'), isFalse);
      expect(hasFgacPermission(claims, 'read', 'doc', 'other'), isFalse);
    });
  });

  group('effectivePermissionsOnResource', () {
    test('inherits viewer permissions from editor', () {
      const schema = <String, Map<String, FgacRelationDefinition>>{
        'doc': {
          'viewer': FgacRelationDefinition(permissions: {'read'}),
          'editor': FgacRelationDefinition(
            permissions: {'write'},
            inherits: ['viewer'],
          ),
        },
      };
      final perms = effectivePermissionsOnResource(
        schema: schema,
        resourceType: 'doc',
        relationNamesHeld: {'editor'},
      );
      expect(perms, containsAll(['read', 'write']));
    });
  });

  group('satisfiesRequirement', () {
    test('RequireAnyPermission', () {
      const schema = <String, Map<String, FgacRelationDefinition>>{
        'doc': {
          'viewer': FgacRelationDefinition(permissions: {'read'}),
        },
      };
      final claims = [
        FgacRelationClaim(resourceType: 'doc', resourceId: 'x', relation: 'viewer'),
      ];
      final ok = satisfiesRequirement(
        claims,
        RequireAnyPermission({'read'}, FgacResourceRef(type: 'doc', id: 'x'), schema),
      );
      expect(ok, isTrue);
    });

    test('RequireAnyPermission works with fgac_permissions only', () {
      const schema = <String, Map<String, FgacRelationDefinition>>{
        'doc': {
          'viewer': FgacRelationDefinition(permissions: {'read'}),
        },
      };
      final relationClaims = <FgacRelationClaim>[];
      final permissionClaims = [
        const FgacPermissionClaim(
          resourceType: 'doc',
          resourceId: 'x',
          permissions: ['read'],
        ),
      ];

      final ok = satisfiesRequirement(
        relationClaims,
        RequireAnyPermission({'read'}, const FgacResourceRef(type: 'doc', id: 'x'), schema),
        fgacPermissions: permissionClaims,
      );
      expect(ok, isTrue);
    });
  });
}
