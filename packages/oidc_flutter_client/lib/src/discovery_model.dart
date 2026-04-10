import 'dart:convert';

import 'package:http/http.dart' as http;

import 'exceptions.dart';

class OidcClientDiscoveryDocument {
  const OidcClientDiscoveryDocument({
    required this.issuer,
    required this.authorizationEndpoint,
    required this.tokenEndpoint,
    required this.userinfoEndpoint,
    required this.jwksUri,
    this.redirectUris = const [],
  });

  final String issuer;
  final String authorizationEndpoint;
  final String tokenEndpoint;
  final String userinfoEndpoint;
  final String jwksUri;
  final List<String> redirectUris;

  static OidcClientDiscoveryDocument parseJson(Map<String, dynamic> json) {
    String req(String key) {
      final v = json[key];
      if (v is! String || v.isEmpty) {
        throw OidcFlutterDiscoveryException('Discovery: missing or invalid $key');
      }
      return v;
    }

    final rawRedirects = json['redirect_uris'];
    final List<String> redirectUris = [];
    if (rawRedirects is List) {
      for (final item in rawRedirects) {
        if (item is String && item.trim().isNotEmpty) {
          redirectUris.add(item.trim());
        }
      }
    }

    return OidcClientDiscoveryDocument(
      issuer: req('issuer'),
      authorizationEndpoint: req('authorization_endpoint'),
      tokenEndpoint: req('token_endpoint'),
      userinfoEndpoint: req('userinfo_endpoint'),
      jwksUri: req('jwks_uri'),
      redirectUris: redirectUris,
    );
  }
}

Future<OidcClientDiscoveryDocument> fetchOidcClientDiscovery({
  required String discoveryUrl,
  http.Client? httpClient,
}) async {
  final client = httpClient ?? http.Client();
  try {
    final res = await client.get(Uri.parse(discoveryUrl));
    final body = res.body;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw OidcFlutterDiscoveryException('Discovery failed (${res.statusCode}): $body');
    }
    final decoded = jsonDecode(body);
    if (decoded is! Map<String, dynamic>) {
      throw OidcFlutterDiscoveryException('Discovery: expected JSON object');
    }
    return OidcClientDiscoveryDocument.parseJson(decoded);
  } on OidcFlutterDiscoveryException {
    rethrow;
  } catch (e, st) {
    Error.throwWithStackTrace(
      OidcFlutterDiscoveryException('Discovery request failed: $e'),
      st,
    );
  } finally {
    if (httpClient == null) {
      client.close();
    }
  }
}
