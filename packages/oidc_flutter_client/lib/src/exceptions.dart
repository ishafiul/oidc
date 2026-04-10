class OidcFlutterAuthException implements Exception {
  OidcFlutterAuthException(this.message, [this.cause]);

  final String message;
  final Object? cause;

  @override
  String toString() =>
      cause != null ? 'OidcFlutterAuthException: $message ($cause)' : 'OidcFlutterAuthException: $message';
}

class OidcFlutterDiscoveryException implements Exception {
  OidcFlutterDiscoveryException(this.message);

  final String message;

  @override
  String toString() => 'OidcFlutterDiscoveryException: $message';
}
