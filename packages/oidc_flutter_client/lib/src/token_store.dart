import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class OidcTokenStore {
  OidcTokenStore({
    required this.keyPrefix,
    FlutterSecureStorage? storage,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _kAccess = '$keyPrefix.access_token',
        _kRefresh = '$keyPrefix.refresh_token',
        _kId = '$keyPrefix.id_token',
        _kExpiry = '$keyPrefix.access_expiry_ms',
        _kRedirect = '$keyPrefix.redirect_uri';

  final FlutterSecureStorage _storage;
  final String keyPrefix;
  final String _kAccess;
  final String _kRefresh;
  final String _kId;
  final String _kExpiry;
  final String _kRedirect;

  Future<void> write({
    required String accessToken,
    String? refreshToken,
    String? idToken,
    required DateTime accessTokenExpiry,
    String? redirectUri,
  }) async {
    await _storage.write(key: _kAccess, value: accessToken);
    await _storage.write(key: _kExpiry, value: accessTokenExpiry.millisecondsSinceEpoch.toString());
    if (refreshToken != null && refreshToken.isNotEmpty) {
      await _storage.write(key: _kRefresh, value: refreshToken);
    }
    if (idToken != null && idToken.isNotEmpty) {
      await _storage.write(key: _kId, value: idToken);
    }
    if (redirectUri != null && redirectUri.isNotEmpty) {
      await _storage.write(key: _kRedirect, value: redirectUri);
    }
  }

  Future<OidcStoredTokens?> read() async {
    final access = await _storage.read(key: _kAccess);
    final expiryRaw = await _storage.read(key: _kExpiry);
    if (access == null || access.isEmpty || expiryRaw == null || expiryRaw.isEmpty) {
      return null;
    }
    final expiryMs = int.tryParse(expiryRaw);
    if (expiryMs == null) {
      return null;
    }
    return OidcStoredTokens(
      accessToken: access,
      refreshToken: await _storage.read(key: _kRefresh),
      idToken: await _storage.read(key: _kId),
      accessTokenExpiry: DateTime.fromMillisecondsSinceEpoch(expiryMs, isUtc: false),
      redirectUri: await _storage.read(key: _kRedirect),
    );
  }

  Future<void> clear() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kId);
    await _storage.delete(key: _kExpiry);
    await _storage.delete(key: _kRedirect);
  }
}

class OidcStoredTokens {
  OidcStoredTokens({
    required this.accessToken,
    this.refreshToken,
    this.idToken,
    required this.accessTokenExpiry,
    this.redirectUri,
  });

  final String accessToken;
  final String? refreshToken;
  final String? idToken;
  final DateTime accessTokenExpiry;
  final String? redirectUri;
}
