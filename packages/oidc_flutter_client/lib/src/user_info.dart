class OidcUserInfo {
  OidcUserInfo({
    required this.sub,
    this.email,
    this.name,
    required this.raw,
  });

  final String sub;
  final String? email;
  final String? name;
  final Map<String, dynamic> raw;

  factory OidcUserInfo.fromJson(Map<String, dynamic> json) {
    final sub = json['sub'];
    if (sub is! String || sub.isEmpty) {
      throw FormatException('userinfo: missing sub');
    }
    final email = json['email'];
    final name = json['name'];
    return OidcUserInfo(
      sub: sub,
      email: email is String ? email : null,
      name: name is String ? name : null,
      raw: Map<String, dynamic>.from(json),
    );
  }
}
