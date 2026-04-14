import 'dart:convert';

import 'package:http/http.dart' as http;

import 'exceptions.dart';

/// OpenID Provider metadata used to verify access tokens for a project.
class OidcDiscoveryDocument {
  OidcDiscoveryDocument({required this.issuer, required this.jwksUri});

  final String issuer;
  final String jwksUri;
}

/// Fetches `/.well-known/openid-configuration` for a project-scoped issuer.
Future<OidcDiscoveryDocument> fetchOidcDiscovery({
  required String apiOrigin,
  required String projectSlug,
  http.Client? httpClient,
}) async {
  final origin = apiOrigin.trim().replaceAll(RegExp(r'/+$'), '');
  final url = Uri.parse(
    '$origin/projects/${Uri.encodeComponent(projectSlug)}/.well-known/openid-configuration',
  );
  final client = httpClient ?? http.Client();
  try {
    final res = await client.get(url);
    final raw = res.body;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw OidcDiscoveryException('Discovery failed (${res.statusCode}): $raw');
    }
    Object? data;
    try {
      data = raw.isEmpty ? null : jsonDecode(raw);
    } catch (_) {
      throw OidcDiscoveryException('Discovery: invalid JSON');
    }
    if (data is! Map<String, dynamic>) {
      throw OidcDiscoveryException('Discovery: expected JSON object');
    }
    final issuer = data['issuer'];
    final jwks = data['jwks_uri'];
    if (issuer is! String || jwks is! String) {
      throw OidcDiscoveryException('Discovery: missing issuer or jwks_uri');
    }
    return OidcDiscoveryDocument(issuer: issuer, jwksUri: jwks);
  } finally {
    if (httpClient == null) {
      client.close();
    }
  }
}
