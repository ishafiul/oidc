String normalizeRedirectUri(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return trimmed;
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null) {
    return trimmed;
  }
  if (uri.scheme == 'http' || uri.scheme == 'https') {
    return uri.replace(fragment: '').toString();
  }
  final scheme = uri.scheme;
  if (uri.host.isNotEmpty && (uri.path.isEmpty || uri.path == '/')) {
    return '$scheme:/${uri.host}${uri.hasQuery ? '?${uri.query}' : ''}';
  }
  final pathPart = uri.path.startsWith('/') ? uri.path : '/${uri.path}';
  return '$scheme:$pathPart${uri.hasQuery ? '?${uri.query}' : ''}';
}

bool redirectUriMatchesRegistered(String candidate, List<String> registered) {
  final n = normalizeRedirectUri(candidate);
  for (final r in registered) {
    if (normalizeRedirectUri(r) == n) {
      return true;
    }
  }
  return false;
}

String pickNativeAppRedirectUri(List<String> uris) {
  for (final u in uris) {
    final s = Uri.tryParse(u)?.scheme.toLowerCase();
    if (s != null && s != 'http' && s != 'https') {
      return u;
    }
  }
  return uris.first;
}
