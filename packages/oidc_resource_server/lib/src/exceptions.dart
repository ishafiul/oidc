class OidcResourceServerException implements Exception {
  OidcResourceServerException(this.message);
  final String message;

  @override
  String toString() => 'OidcResourceServerException: $message';
}

class OidcDiscoveryException extends OidcResourceServerException {
  OidcDiscoveryException(super.message);
}

class OidcTokenVerificationException extends OidcResourceServerException {
  OidcTokenVerificationException(super.message);
}
