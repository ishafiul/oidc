import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';
import 'package:oidc_flutter_client/oidc_flutter_client.dart';

import 'demo_settings.dart';

final OidcFlutterClient oidc = OidcFlutterClient(
  config: OidcFlutterConfig(
    apiOrigin: OidcDemoSettings.apiOrigin,
    projectSlug: OidcDemoSettings.projectSlug,
    clientId: OidcDemoSettings.clientId,
    scopes: OidcDemoSettings.scopes,
    allowInsecureConnections: OidcDemoSettings.apiOrigin.startsWith('http:'),
  ),
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  oidc.onError = (message, error, stackTrace) {
    debugPrint('$message\n$error\n$stackTrace');
  };
  await oidc.initialize();
  runApp(const OidcLoginDemoApp());
}

class OidcLoginDemoApp extends StatelessWidget {
  const OidcLoginDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OIDC login demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _busy = false;
  String? _status;
  String? _userInfoLine;
  String? _tokenPreview;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _status = null;
      _userInfoLine = null;
      _tokenPreview = null;
    });
    final ok = await oidc.login(hostedLogin: true);
    if (!mounted) {
      return;
    }
    setState(() {
      _busy = false;
      _status = ok ? 'Logged in' : 'Login failed (see console if onError)';
      if (ok) {
        final t = oidc.accessToken;
        _tokenPreview = t == null || t.length < 24 ? t : '${t.substring(0, 20)}…';
      }
    });
  }

  Future<void> _logout() async {
    setState(() {
      _busy = true;
      _userInfoLine = null;
      _tokenPreview = null;
    });
    await oidc.logout();
    if (!mounted) {
      return;
    }
    setState(() {
      _busy = false;
      _status = 'Logged out';
    });
  }

  Future<void> _loadUserInfo() async {
    setState(() {
      _busy = true;
      _userInfoLine = null;
    });
    final info = await oidc.getUserInfo();
    if (!mounted) {
      return;
    }
    setState(() {
      _busy = false;
      _userInfoLine = info == null
          ? 'No userinfo (not signed in or request failed)'
          : 'sub=${info.sub} email=${info.email ?? '—'} name=${info.name ?? '—'}';
    });
  }

  Future<void> _refresh() async {
    setState(() => _busy = true);
    final ok = await oidc.refreshAccessToken();
    if (!mounted) {
      return;
    }
    final t = oidc.accessToken;
    setState(() {
      _busy = false;
      _status = ok ? 'Refresh ok' : 'Refresh failed';
      _tokenPreview = t == null || t.length < 24 ? t : '${t.substring(0, 20)}…';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('OIDC login demo'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: StreamBuilder<bool>(
          initialData: oidc.isAuthenticated,
          stream: oidc.authenticationStream,
          builder: (context, snapshot) {
            final authed = snapshot.data ?? false;
            return ListView(
              children: [
                Text(
                  'API: ${OidcDemoSettings.apiOrigin}\n'
                  'Project: ${OidcDemoSettings.projectSlug}\n'
                  'Client: ${OidcDemoSettings.clientId}\n'
                  'Redirect: ${oidc.resolvedRedirectUri ?? '—'}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Text(
                  kReleaseMode
                      ? 'Production API ${OidcDemoSettings.productionApiOrigin} · hosted login https://oidclogin.shafi.dev · '
                          'redirect URI comes from discovery (register native URIs on the OAuth client).'
                      : 'Dev: discovery includes redirect_uris for this client_id; native scheme must match Android/iOS intent filters.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _login,
                  child: const Text('Login (browser OTP)'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy || !authed ? null : _logout,
                  child: const Text('Logout'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy || !authed ? null : _refresh,
                  child: const Text('Refresh access token'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy || !authed ? null : _loadUserInfo,
                  child: const Text('Fetch userinfo'),
                ),
                const SizedBox(height: 24),
                if (_status != null) Text('Status: $_status'),
                if (_tokenPreview != null) Text('Access token: $_tokenPreview'),
                if (_userInfoLine != null) Text(_userInfoLine!),
              ],
            );
          },
        ),
      ),
    );
  }
}
