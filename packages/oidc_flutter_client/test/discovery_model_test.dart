import 'package:flutter_test/flutter_test.dart';
import 'package:oidc_flutter_client/oidc_flutter_client.dart';

void main() {
  test('OidcClientDiscoveryDocument.parseJson', () {
    final d = OidcClientDiscoveryDocument.parseJson({
      'issuer': 'https://api.example.com/projects/p',
      'authorization_endpoint': 'https://api.example.com/projects/p/oidc/authorize',
      'token_endpoint': 'https://api.example.com/projects/p/oidc/token',
      'userinfo_endpoint': 'https://api.example.com/projects/p/oidc/userinfo',
      'jwks_uri': 'https://api.example.com/projects/p/oidc/jwks',
    });
    expect(d.issuer, endsWith('/projects/p'));
    expect(d.userinfoEndpoint, contains('userinfo'));
    expect(d.redirectUris, isEmpty);
  });

  test('OidcClientDiscoveryDocument.parseJson reads redirect_uris', () {
    final d = OidcClientDiscoveryDocument.parseJson({
      'issuer': 'https://api.example.com/projects/p',
      'authorization_endpoint': 'https://api.example.com/projects/p/oidc/authorize',
      'token_endpoint': 'https://api.example.com/projects/p/oidc/token',
      'userinfo_endpoint': 'https://api.example.com/projects/p/oidc/userinfo',
      'jwks_uri': 'https://api.example.com/projects/p/oidc/jwks',
      'redirect_uris': ['dev.app:/oauth', 'https://app/cb'],
    });
    expect(d.redirectUris, ['dev.app:/oauth', 'https://app/cb']);
  });
}
