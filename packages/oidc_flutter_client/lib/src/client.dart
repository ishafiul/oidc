import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:http/http.dart' as http;

import 'access_token_claims.dart';
import 'config.dart';
import 'discovery_model.dart';
import 'exceptions.dart';
import 'redirect_uri_normalize.dart';
import 'token_store.dart';
import 'user_info.dart';

typedef OidcFlutterOnError = void Function(String message, Object error, StackTrace stackTrace);

class OidcFlutterClient {
  OidcFlutterClient({
    required OidcFlutterConfig config,
    FlutterAppAuth? appAuth,
    OidcTokenStore? tokenStore,
    http.Client? httpClient,
  })  : _config = config,
        _appAuth = appAuth ?? const FlutterAppAuth(),
        _store = tokenStore ?? OidcTokenStore(keyPrefix: config.storageKeyPrefix),
        _httpClient = httpClient;

  final OidcFlutterConfig _config;
  final FlutterAppAuth _appAuth;
  final OidcTokenStore _store;
  final http.Client? _httpClient;

  final StreamController<bool> _authController = StreamController<bool>.broadcast();

  OidcClientDiscoveryDocument? _discovery;
  OidcStoredTokens? _memory;
  String? _effectiveRedirectUri;

  OidcFlutterOnError? onError;

  Stream<bool> get authenticationStream => _authController.stream;

  bool get isAuthenticated => _memory != null;

  String? get accessToken => _memory?.accessToken;

  String? get refreshToken => _memory?.refreshToken;

  String? get idToken => _memory?.idToken;

  OidcAccessTokenClaims? get accessTokenClaims => parseOidcAccessTokenClaims(accessToken);

  String? get resolvedRedirectUri => _effectiveRedirectUri;

  String get _redirectForAuth {
    final r = _effectiveRedirectUri?.trim();
    if (r == null || r.isEmpty) {
      throw StateError('Redirect URI not resolved');
    }
    return r;
  }

  String? get _clientSecretOrNull {
    final s = _config.clientSecret?.trim();
    if (s == null || s.isEmpty) {
      return null;
    }
    return s;
  }

  Future<void> initialize() async {
    final stored = await _store.read();
    final persistedRedirect = stored?.redirectUri?.trim();
    if (persistedRedirect != null && persistedRedirect.isNotEmpty) {
      _effectiveRedirectUri = persistedRedirect;
    }
    if (stored == null) {
      _memory = null;
      _authController.add(false);
      await _tryResolveRedirectFromDiscovery();
      return;
    }
    final hasRefresh = stored.refreshToken != null && stored.refreshToken!.isNotEmpty;
    final accessValid = stored.accessTokenExpiry.isAfter(DateTime.now());
    if (!accessValid && !hasRefresh) {
      await _store.clear();
      _memory = null;
      _effectiveRedirectUri = null;
      _authController.add(false);
      await _tryResolveRedirectFromDiscovery();
      return;
    }
    _memory = stored;
    _authController.add(true);
    await _tryResolveRedirectFromDiscovery();
  }

  Future<void> _tryResolveRedirectFromDiscovery() async {
    if (_effectiveRedirectUri != null && _effectiveRedirectUri!.trim().isNotEmpty) {
      return;
    }
    try {
      await _resolveRedirectFromDiscovery();
    } catch (e, st) {
      _reportError('Could not resolve redirect URI from discovery', e, st);
    }
  }

  Future<void> _resolveRedirectFromDiscovery() async {
    final doc = await fetchOidcClientDiscovery(
      discoveryUrl: _config.discoveryUrl,
      httpClient: _httpClient,
    );
    _discovery = doc;
    final explicit = _config.redirectUrl?.trim();
    final fromServer = doc.redirectUris;
    if (explicit != null && explicit.isNotEmpty) {
      if (fromServer.isEmpty) {
        _effectiveRedirectUri = normalizeRedirectUri(explicit);
        return;
      }
      if (!redirectUriMatchesRegistered(explicit, fromServer)) {
        throw OidcFlutterDiscoveryException(
          'redirectUrl "$explicit" is not in server redirect_uris: $fromServer',
        );
      }
      for (final u in fromServer) {
        if (normalizeRedirectUri(u) == normalizeRedirectUri(explicit)) {
          _effectiveRedirectUri = u;
          return;
        }
      }
      _effectiveRedirectUri = normalizeRedirectUri(explicit);
      return;
    }
    if (fromServer.isEmpty) {
      throw OidcFlutterDiscoveryException(
        'Discovery has no redirect_uris; set OidcFlutterConfig.redirectUrl or register URIs for this client.',
      );
    }
    _effectiveRedirectUri = pickNativeAppRedirectUri(fromServer);
  }

  Future<bool> login({
    String? loginHint,
    bool hostedLogin = false,
    List<String>? scopes,
  }) async {
    final hint = loginHint?.trim() ?? '';
    if (!hostedLogin && hint.isEmpty) {
      _reportError(
        'login_hint is required unless hostedLogin is true',
        ArgumentError('empty loginHint'),
        StackTrace.current,
      );
      return false;
    }
    try {
      if (_effectiveRedirectUri == null || _effectiveRedirectUri!.trim().isEmpty) {
        try {
          await _resolveRedirectFromDiscovery();
        } catch (e, st) {
          _reportError('Redirect resolution failed', e, st);
          return false;
        }
      }
      final req = AuthorizationTokenRequest(
        _config.clientId.trim(),
        _redirectForAuth,
        clientSecret: _clientSecretOrNull,
        discoveryUrl: _config.discoveryUrl,
        scopes: scopes ?? _config.scopes,
        loginHint: hostedLogin ? null : hint,
        allowInsecureConnections: _config.allowInsecureConnections,
      );
      final res = await _appAuth.authorizeAndExchangeCode(req);
      await _applyAuthorizationResponse(res);
      _authController.add(true);
      return true;
    } catch (e, st) {
      _reportError('Login failed', e, st);
      return false;
    }
  }

  Future<void> _applyAuthorizationResponse(AuthorizationTokenResponse res) async {
    final access = res.accessToken;
    if (access == null || access.isEmpty) {
      throw OidcFlutterAuthException('Token response missing access_token');
    }
    final expiry = _expiryFromTokenResponse(res);
    final refresh = res.refreshToken;
    final id = res.idToken;
    await _store.write(
      accessToken: access,
      refreshToken: refresh,
      idToken: id,
      accessTokenExpiry: expiry,
      redirectUri: _effectiveRedirectUri,
    );
    _memory = OidcStoredTokens(
      accessToken: access,
      refreshToken: refresh,
      idToken: id,
      accessTokenExpiry: expiry,
      redirectUri: _effectiveRedirectUri,
    );
  }

  DateTime _expiryFromTokenResponse(TokenResponse r) {
    final direct = r.accessTokenExpirationDateTime;
    if (direct != null) {
      return direct;
    }
    final raw = r.tokenAdditionalParameters?['expires_in'];
    if (raw is int) {
      return DateTime.now().add(Duration(seconds: raw));
    }
    if (raw is String) {
      final s = int.tryParse(raw);
      if (s != null) {
        return DateTime.now().add(Duration(seconds: s));
      }
    }
    return DateTime.now().add(const Duration(seconds: 3600));
  }

  Future<String?> getValidAccessToken({Duration skew = const Duration(seconds: 60)}) async {
    var mem = _memory ?? await _store.read();
    if (mem == null) {
      return null;
    }
    final now = DateTime.now();
    if (mem.accessTokenExpiry.isAfter(now.add(skew))) {
      _memory = mem;
      return mem.accessToken;
    }
    final rt = mem.refreshToken;
    if (rt == null || rt.isEmpty) {
      await logout();
      return null;
    }
    final refreshed = await _exchangeRefresh(mem, rt);
    return refreshed?.accessToken;
  }

  Future<bool> refreshAccessToken() async {
    var mem = _memory ?? await _store.read();
    if (mem == null) {
      return false;
    }
    final rt = mem.refreshToken;
    if (rt == null || rt.isEmpty) {
      return false;
    }
    final refreshed = await _exchangeRefresh(mem, rt);
    return refreshed != null;
  }

  Future<OidcStoredTokens?> _exchangeRefresh(OidcStoredTokens mem, String refreshToken) async {
    try {
      final tr = await _appAuth.token(
        TokenRequest(
          _config.clientId.trim(),
          _redirectForAuth,
          clientSecret: _clientSecretOrNull,
          refreshToken: refreshToken,
          discoveryUrl: _config.discoveryUrl,
          allowInsecureConnections: _config.allowInsecureConnections,
        ),
      );
      final access = tr.accessToken;
      if (access == null || access.isEmpty) {
        await logout();
        return null;
      }
      final expiry = _expiryFromTokenResponse(tr);
      final nextRefresh =
          (tr.refreshToken != null && tr.refreshToken!.isNotEmpty) ? tr.refreshToken! : refreshToken;
      final nextId = (tr.idToken != null && tr.idToken!.isNotEmpty) ? tr.idToken : mem.idToken;
      await _store.write(
        accessToken: access,
        refreshToken: nextRefresh,
        idToken: nextId,
        accessTokenExpiry: expiry,
        redirectUri: _effectiveRedirectUri,
      );
      final next = OidcStoredTokens(
        accessToken: access,
        refreshToken: nextRefresh,
        idToken: nextId,
        accessTokenExpiry: expiry,
        redirectUri: _effectiveRedirectUri,
      );
      _memory = next;
      _authController.add(true);
      return next;
    } catch (e, st) {
      _reportError('Refresh token failed', e, st);
      await logout();
      return null;
    }
  }

  Future<OidcUserInfo?> getUserInfo() async {
    final access = await getValidAccessToken();
    if (access == null) {
      return null;
    }
    _discovery ??= await fetchOidcClientDiscovery(
      discoveryUrl: _config.discoveryUrl,
      httpClient: _httpClient,
    );
    final uri = Uri.parse(_discovery!.userinfoEndpoint);
    final client = _httpClient ?? http.Client();
    try {
      final res = await client.get(
        uri,
        headers: {'Authorization': 'Bearer $access', 'Accept': 'application/json'},
      );
      final body = res.body;
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw OidcFlutterAuthException('userinfo failed (${res.statusCode}): $body');
      }
      final decoded = jsonDecode(body);
      if (decoded is! Map<String, dynamic>) {
        throw OidcFlutterAuthException('userinfo: expected JSON object');
      }
      return OidcUserInfo.fromJson(decoded);
    } finally {
      if (_httpClient == null) {
        client.close();
      }
    }
  }

  Future<void> logout() async {
    await _store.clear();
    _memory = null;
    _effectiveRedirectUri = null;
    _authController.add(false);
  }

  void _reportError(String message, Object error, StackTrace stackTrace) {
    final handler = onError;
    if (handler != null) {
      handler(message, error, stackTrace);
    } else if (kDebugMode) {
      debugPrint('$message: $error');
    }
  }
}
