```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Multi-Project OIDC Admin Platform

### Canonical OIDC endpoints (project-scoped)

- `GET /projects/:projectSlug/.well-known/openid-configuration`
- `GET /projects/:projectSlug/oidc/jwks`
- `GET /projects/:projectSlug/oidc/authorize`
- `POST /projects/:projectSlug/oidc/token`
- `GET /projects/:projectSlug/oidc/userinfo`

### Compatibility aliases

- `GET /.well-known/openid-configuration`
- `GET /oidc/jwks`
- `GET /oidc/authorize`
- `POST /oidc/token`
- `GET /oidc/userinfo`

Aliases are resolved through `OIDC_DEFAULT_PROJECT_SLUG`.

### Admin auth and management

- Cookie-based admin OTP login:
  - `POST /auth/admin/otp/request`
  - `POST /auth/admin/otp/verify`
  - `GET /auth/admin/session`
  - `POST /auth/admin/logout`
- Project-scoped management via ORPC routes:
  - `/projects/*` (projects, members/invites, clients, scope sets)
  - `/projects/:slug/permissions/*` (FGAC management + checks)

### Required env additions

When the admin UI is on another **subdomain** of the same registrable domain as the API (e.g. `oidcadmin.shafi.dev` → `oidcapi.shafi.dev`), set **`ADMIN_COOKIE_DOMAIN`** to **`.shafi.dev`** (leading dot) and **`ADMIN_COOKIE_SECURE`** to **`true`**. Otherwise the browser sends the HttpOnly session cookie on `fetch` to the API but **JavaScript on the admin origin cannot read the CSRF cookie**, so `x-csrf-token` is missing and write requests return **403**. For **local** `wrangler dev`, override in **`.dev.vars`**: `ADMIN_COOKIE_DOMAIN=` (empty) and `ADMIN_COOKIE_SECURE=false`.

- `OIDC_DEFAULT_PROJECT_SLUG`
- `ADMIN_ALLOWED_ORIGINS`
- `ADMIN_SESSION_COOKIE_NAME`
- `ADMIN_CSRF_COOKIE_NAME`
- `ADMIN_COOKIE_SECURE`
- `ADMIN_COOKIE_DOMAIN`
- `ADMIN_INVITE_BASE_URL`
- `ADMIN_INVITE_FROM_EMAIL`

### Migration/reset

This cutover assumes a one-shot reset of OIDC/project auth data and permissions data.
Push schema before running flows:

```bash
pnpm migration:push:local
```
