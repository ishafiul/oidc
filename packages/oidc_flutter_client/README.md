# oidc_flutter_client

Flutter client for this repo’s **project-scoped OIDC** API: authorization code + **PKCE** (via [flutter_appauth](https://pub.dev/packages/flutter_appauth)), **secure token storage**, **refresh**, and **userinfo**.

Behavior is similar in spirit to [keycloak_wrapper](https://pub.dev/packages/keycloak_wrapper): initialize once, listen to `authenticationStream`, call `login` / `logout`, read tokens from memory after login.

## Server expectations

Your backend exposes discovery at:

`{apiOrigin}/projects/{projectSlug}/.well-known/openid-configuration`

Authorization requires **PKCE**. The server can either:

- **`login(hostedLogin: true)`** — no `login_hint` on the first authorize request; the API redirects to **`OIDC_HOSTED_LOGIN_URL`** (hosted OTP + device flow), then the user returns to authorize with `login_hint` and receives a code.

- **`login(loginHint: 'user@example.com')`** — send `login_hint` immediately; the API issues a code without hosted login (demo-style; see `OidcService.authorize`).

## Add to a Flutter app

```yaml
dependencies:
  oidc_flutter_client:
    path: ../path/to/packages/oidc_flutter_client
```

### Android

In `android/app/build.gradle.kts` (or `build.gradle`), set the custom scheme used as your redirect (must match `redirectUrl` and stay **lowercase**):

```kotlin
android {
    defaultConfig {
        manifestPlaceholders["appAuthRedirectScheme"] = "com.example.myapp"
    }
}
```

Use `+=` for `manifestPlaceholders` if your template already sets other placeholders.

### iOS / macOS

In `Info.plist`, register the same scheme as in `redirectUrl`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.example.myapp</string>
    </array>
  </dict>
</array>
```

### OIDC client registration

Register a **redirect URI** that matches `redirectUrl`, e.g. `com.example.myapp:/oauth` if the scheme is `com.example.myapp` and AppAuth uses path `/oauth`.

Use a **public** client (no secret) for mobile unless you use a confidential client with `clientSecret`.

## Usage

```dart
import 'package:oidc_flutter_client/oidc_flutter_client.dart';

final oidc = OidcFlutterClient(
  config: OidcFlutterConfig(
    apiOrigin: 'https://api.example.com',
    projectSlug: 'default',
    clientId: 'your-oauth-client-id',
    redirectUrl: 'com.example.myapp:/oauth',
    allowInsecureConnections: false,
  ),
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  oidc.onError = (message, error, st) { /* log / snackbar */ };
  await oidc.initialize();
  runApp(const MyApp());
}

Future<void> signInHosted() async {
  final ok = await oidc.login(hostedLogin: true);
  if (!ok) { /* handle */ }
}

Future<void> signInWithHint() async {
  final ok = await oidc.login(loginHint: 'user@example.com');
  if (!ok) { /* handle */ }
}

Future<void> callApi() async {
  final token = await oidc.getValidAccessToken();
  if (token == null) return;
  // Authorization: Bearer $token
}

Future<void> signOut() async {
  await oidc.logout();
}
```

Listen for session presence (like `keycloak_wrapper.authenticationStream`):

```dart
StreamBuilder<bool>(
  initialData: oidc.isAuthenticated,
  stream: oidc.authenticationStream,
  builder: (context, snapshot) {
    final authed = snapshot.data ?? false;
    return authed ? const Home() : const Login();
  },
)
```

## API

| Member | Purpose |
|--------|---------|
| `initialize()` | Load tokens from secure storage; updates `authenticationStream`. |
| `login({loginHint, hostedLogin, scopes})` | Authorize + code exchange (PKCE). Use `hostedLogin: true` for server redirect to hosted OTP UI; else pass `loginHint` for direct code. |
| `logout()` | Clears secure storage and memory; emits `false`. |
| `getValidAccessToken({skew})` | Returns access token, refreshing with `refresh_token` when near expiry. |
| `refreshAccessToken()` | Forces a refresh grant. |
| `getUserInfo()` | GETs OpenID userinfo with the current access token. |
| `accessToken` / `refreshToken` / `idToken` | In-memory snapshots after `initialize` / login / refresh (may be stale until refreshed). |
| `isAuthenticated` | Whether a restorable session exists in memory after `initialize`. |
| `onError` | Optional callback when login/refresh fails. |

There is **no** RP-initiated OIDC logout URL in the current server discovery document; `logout` is **local** (clear tokens only).

## Local HTTP (e.g. Wrangler)

Set `allowInsecureConnections: true` on `OidcFlutterConfig` only for dev, and follow platform guides to allow cleartext to your dev host if needed.
