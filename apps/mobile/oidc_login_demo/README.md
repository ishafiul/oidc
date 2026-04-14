# oidc_login_demo

Minimal Flutter app to exercise [`oidc_flutter_client`](../../packages/dart/oidc_flutter_client).

## Production (release builds)

| Service        | URL                          |
| -------------- | ---------------------------- |
| API            | `https://oidcapi.shafi.dev`  |
| Hosted login   | `https://oidclogin.shafi.dev` (set `OIDC_HOSTED_LOGIN_URL` on the API) |
| Admin          | `https://oidcadmin.shafi.dev` (not used by this app) |

`flutter run --release` / store builds use **`https://oidcapi.shafi.dev`** automatically. Hosted login must be configured on the API to **`https://oidclogin.shafi.dev`**.

OAuth client **`example-app`** must allow redirect URI **`dev.oidc.logindemo:/oauth`** and the scopes in `lib/demo_settings.dart`.

Override API origin anytime:

`flutter run --dart-define=OIDC_API_ORIGIN=https://other.example.com`

## Local development (debug)

Debug builds default to **`http://10.0.2.2:8787`** (Android emulator) or **`http://127.0.0.1:8787`** (iOS simulator / desktop).

1. Run API (e.g. Wrangler on **8787**) with **`OIDC_HOSTED_LOGIN_URL`** pointing at oidc-login (on emulator use **`http://10.0.2.2:5174`**, not `localhost`).
2. **oidc-login** **`VITE_API_BASE_URL`** origin must match the origin this app uses (e.g. `http://10.0.2.2:8787` on emulator).

## Run

```bash
cd apps/mobile/oidc_login_demo
flutter pub get
flutter run
```

Release smoke test:

```bash
flutter run --release
```

Tap **Login (browser OTP)** — complete hosted login in the browser sheet, then use **Fetch userinfo** / **Refresh access token** as needed.
