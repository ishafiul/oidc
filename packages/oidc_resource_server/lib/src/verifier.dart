import 'package:jose/jose.dart';

import 'discovery.dart';
import 'exceptions.dart';
import 'verified_access_token.dart';

/// Verifies RS256 access JWTs against issuer, audience, and JWKS (remote URL).
///
/// [allowedAudiences] is the set of OAuth **client_id** values your API accepts
/// (e.g. web SPA, mobile app, admin client). The JWT `aud` claim must contain
/// at least one of them.
///
/// Framework-agnostic: construct once per process (or per isolate) and call [verify].
class OidcAccessTokenVerifier {
  OidcAccessTokenVerifier({
    required String issuer,
    required Iterable<String> allowedAudiences,
    required String jwksUri,
    List<String> allowedAlgorithms = const ['RS256'],
  })  : _issuerUri = Uri.parse(issuer.trim()),
        _allowedAudiences = _normalizeAllowedAudiences(allowedAudiences),
        _jwksUri = Uri.parse(jwksUri.trim()),
        _allowedAlgorithms = allowedAlgorithms;

  final Uri _issuerUri;
  final Set<String> _allowedAudiences;
  final Uri _jwksUri;
  final List<String> _allowedAlgorithms;

  final JsonWebKeyStore _keyStore = JsonWebKeyStore();

  bool _keysLoaded = false;

  void _ensureKeyStore() {
    if (_keysLoaded) return;
    _keyStore.addKeySetUrl(_jwksUri);
    _keysLoaded = true;
  }

  /// Build verifier from discovery (e.g. [fetchOidcDiscovery]).
  factory OidcAccessTokenVerifier.fromDiscovery({
    required OidcDiscoveryDocument discovery,
    required Iterable<String> allowedAudiences,
    List<String> allowedAlgorithms = const ['RS256'],
  }) {
    return OidcAccessTokenVerifier(
      issuer: discovery.issuer,
      allowedAudiences: allowedAudiences,
      jwksUri: discovery.jwksUri,
      allowedAlgorithms: allowedAlgorithms,
    );
  }

  /// `Bearer …` or raw JWT compact string.
  Future<VerifiedAccessToken> verify(String authorizationHeaderOrRawJwt) async {
    final token = _extractBearer(authorizationHeaderOrRawJwt);
    _ensureKeyStore();
    late final JsonWebToken jwt;
    try {
      jwt = await JsonWebToken.decodeAndVerify(
        token,
        _keyStore,
        allowedArguments: _allowedAlgorithms,
      );
    } catch (e, st) {
      Error.throwWithStackTrace(
        OidcTokenVerificationException('JWT verify failed: $e'),
        st,
      );
    }

    final claimsMap = jwt.claims.toJson();

    final tokenUse = claimsMap['token_use'];
    if (tokenUse is String && tokenUse != 'access') {
      throw OidcTokenVerificationException('Expected access token (token_use)');
    }

    for (final err in jwt.claims.validate(
      issuer: _issuerUri,
      clientId: null,
    )) {
      throw OidcTokenVerificationException(err.toString());
    }

    final tokenAud = jwt.claims.audience;
    if (tokenAud == null || tokenAud.isEmpty) {
      throw OidcTokenVerificationException('JWT is missing aud claim');
    }
    if (!tokenAud.any(_allowedAudiences.contains)) {
      throw OidcTokenVerificationException(
        'JWT aud does not include any configured allowed audience',
      );
    }

    return VerifiedAccessToken.fromClaimsMap(claimsMap);
  }
}

Set<String> _normalizeAllowedAudiences(Iterable<String> raw) {
  final out = <String>{};
  for (final a in raw) {
    final t = a.trim();
    if (t.isNotEmpty) {
      out.add(t);
    }
  }
  if (out.isEmpty) {
    throw ArgumentError.value(
      raw,
      'allowedAudiences',
      'must contain at least one non-empty string',
    );
  }
  return out;
}

String _extractBearer(String raw) {
  final t = raw.trim();
  const p = 'Bearer ';
  if (t.length > p.length && t.substring(0, p.length).toLowerCase() == p.toLowerCase()) {
    return t.substring(p.length).trim();
  }
  return t;
}
