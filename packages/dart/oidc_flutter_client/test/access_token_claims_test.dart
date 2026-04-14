import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:oidc_flutter_client/oidc_flutter_client.dart';

String fakeJwt(Map<String, Object?> payload) {
  final body = base64Url.encode(utf8.encode(jsonEncode(payload))).replaceAll('=', '');
  return 'e30.$body.sig';
}

void main() {
  test('parseOidcAccessTokenClaims reads scope roles fgac resource_access', () {
    final tok = fakeJwt({
      'scope': 'openid demo:data:read',
      'realm_access': {'roles': ['editor', 'viewer']},
      'fgac_relations': [
        {'resource_type': 'project', 'resource_id': 'p1', 'relation': 'member'},
      ],
      'fgac_truncated': false,
      'resource_access': {'my-client': {'roles': ['editor']}},
    });
    final c = parseOidcAccessTokenClaims(tok)!;
    expect(c.hasScope('demo:data:read'), isTrue);
    expect(c.hasScope('missing'), isFalse);
    expect(c.hasRealmRole('editor'), isTrue);
    expect(
      c.hasFgacRelation(resourceType: 'project', resourceId: 'p1', relation: 'member'),
      isTrue,
    );
    expect(c.clientRoles('my-client'), ['editor']);
    expect(c.fgacTruncated, isFalse);
  });

  test('parseOidcAccessTokenClaims null or invalid', () {
    expect(parseOidcAccessTokenClaims(null), isNull);
    expect(parseOidcAccessTokenClaims(''), isNull);
    expect(parseOidcAccessTokenClaims('nope'), isNull);
  });
}
