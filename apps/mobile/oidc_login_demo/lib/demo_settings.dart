import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb, kReleaseMode;

class OidcDemoSettings {
  static const String productionApiOrigin = 'https://oidcapi.shafi.dev';

  static String get apiOrigin {
    const fromEnv = String.fromEnvironment(
      'OIDC_API_ORIGIN',
      defaultValue: '',
    );
    if (fromEnv.isNotEmpty) {
      return fromEnv;
    }
    if (kReleaseMode) {
      return productionApiOrigin;
    }
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'https://oidcapi.shafi.dev';
    }
    return 'https://oidcapi.shafi.dev';
  }

  static const String projectSlug = 'default';

  static const String clientId = 'example-app';

  static const List<String> scopes = [
    'openid',
    'profile',
    'email',
    'demo:data:read',
  ];
}
