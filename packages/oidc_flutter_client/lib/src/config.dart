class OidcFlutterConfig {
  const OidcFlutterConfig({
    required this.apiOrigin,
    required this.projectSlug,
    required this.clientId,
    this.redirectUrl,
    this.clientSecret,
    this.scopes = const ['openid', 'profile', 'email'],
    this.allowInsecureConnections = false,
    this.storageNamespace,
  });

  final String apiOrigin;
  final String projectSlug;
  final String clientId;
  final String? redirectUrl;
  final String? clientSecret;
  final List<String> scopes;
  final bool allowInsecureConnections;
  final String? storageNamespace;

  String get discoveryUrl {
    final origin = apiOrigin.trim().replaceAll(RegExp(r'/+$'), '');
    final base = Uri.parse(
      '$origin/projects/${Uri.encodeComponent(projectSlug.trim())}/.well-known/openid-configuration',
    );
    final cid = clientId.trim();
    if (cid.isEmpty) {
      return base.toString();
    }
    return base.replace(queryParameters: {'client_id': cid}).toString();
  }

  String get storageKeyPrefix {
    final ns = storageNamespace?.trim();
    if (ns != null && ns.isNotEmpty) {
      return 'oidc_flutter.$ns';
    }
    return 'oidc_flutter.${clientId.trim()}.${projectSlug.trim()}';
  }
}
