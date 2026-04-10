# OIDC SPA example (React + PKCE)

Minimal React app that runs the full **authorization code + PKCE** flow against this repo’s API: discovery → authorize (hosted login + OTP) → callback → token → userinfo.

## Ports

| Service        | Port | Env / command                          |
| -------------- | ---- | -------------------------------------- |
| API (Wrangler) | 8787 | `apps/backend/api_server` `pnpm dev`   |
| Hosted login   | 5174 | `apps/webapp/oidc-login` `pnpm dev`    |
| This SPA       | 5175 | `apps/webapp/oidc-spa-example` `pnpm dev` |
| Example Hono API | 8788 | same package `pnpm dev` (runs with Vite via `concurrently`) |

## API configuration

In `apps/backend/api_server/wrangler.jsonc` (or secrets):

- `OIDC_HOSTED_LOGIN_URL` = `http://localhost:5174` (must match hosted login origin).
- `ADMIN_ALLOWED_ORIGINS` must include `http://localhost:5174` and `http://localhost:5175` if you use an allowlist (already added for 5174 in repo defaults; add 5175 if needed).

## Register an OIDC client

In **oidc-admin**, for the project whose slug matches `VITE_OIDC_PROJECT_SLUG` (default `default`):

1. Create a client with **Client ID** `example-spa` (or change `.env.development` to match).
2. **Public** client is enough for this demo (no secret).
3. Add redirect URI **exactly**: `http://localhost:5175/callback`
4. Attach a scope set that includes **`openid`**, **`email`**, **`profile`**, and for the permissions demo **`demo:data:read`** and **`demo:data:grant`** (or adjust `VITE_OIDC_SCOPE` to match what the client allows).

## Permissions demo (Hono)

`pnpm dev` starts **Vite** (5175) and a small **Hono** server (8788). The SPA calls it via Vite proxy prefix **`/example-api`**.

- **OIDC**: Hono loads discovery from `{API_ORIGIN}/projects/{slug}/.well-known/openid-configuration`, builds a JWKS client from `jwks_uri`, and verifies access tokens (`iss`, `aud` = client id, RS256).
- **Scopes** (in the access token `scope` claim):
  - `demo:data:read` — can `GET /api/data/quarterly-report`
  - `demo:data:grant` — can `POST /api/data/quarterly-report/grant` with `{ "granteeSub": "<other user sub>" }` so that user can read without the read scope (in-memory grants, dev only).
- **UI**: open **`/permissions`** after sign-in to see **`GET /api/me`** (scopes + effective access) and try read/grant.

Server env (also in root `.env.development` for convenience): see `server/.env.example` — `API_ORIGIN`, `OIDC_PROJECT_SLUG`, `OIDC_CLIENT_ID`, `EXAMPLE_API_PORT`.

Use **`pnpm dev:vite`** if you only want the SPA without the Hono process.

## Run

```bash
# terminal 1 — API
cd apps/backend/api_server && pnpm dev

# terminal 2 — hosted login
cd apps/webapp/oidc-login && pnpm dev

# terminal 3 — this app
cd apps/webapp/oidc-spa-example && pnpm install && pnpm dev
```

Open `http://localhost:5175`, click **Sign in with OIDC**, complete email/OTP on the login app, then you should land on `/callback` with tokens and userinfo.

## Environment

Copy or edit `.env.development`:

- `VITE_API_ORIGIN` — API origin (no `/api` suffix), e.g. `http://localhost:8787`
- `VITE_OIDC_PROJECT_SLUG` — project slug from `/projects/{slug}/...`
- `VITE_OIDC_CLIENT_ID` — registered client id
- `VITE_OIDC_REDIRECT_URI` — must be `http://localhost:5175/callback` for default Vite port
- `VITE_OIDC_SCOPE` — space-separated scopes; include `demo:data:read` and `demo:data:grant` for the permissions page
- `VITE_OIDC_CLIENT_SECRET` — optional; only if the client is **confidential**
- `API_ORIGIN`, `OIDC_PROJECT_SLUG`, `OIDC_CLIENT_ID`, `EXAMPLE_API_PORT` — used by the Hono server (same values as Vite vars; see `.env.development`)

## Flow summary

1. Loads discovery from `{API}/projects/{slug}/.well-known/openid-configuration`.
2. Generates PKCE verifier/challenge + `state`, stores verifier in `sessionStorage`.
3. Redirects browser to `authorization_endpoint` (no `login_hint` first).
4. API redirects to hosted login with `return_url`; after OTP, user returns to authorize with `login_hint`, then API redirects to this app with `?code=&state=`.
5. `/callback` exchanges the code at `token_endpoint` (form body) and calls `userinfo` with the access token.

The ID token payload is **decoded only for display**, not cryptographically verified in this demo.
