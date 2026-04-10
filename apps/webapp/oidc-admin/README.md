# OIDC Admin Panel

React admin app for the API server OIDC MVP.

## Stack

- React + TypeScript + Vite
- TanStack Router
- TanStack Query
- Zustand (persisted browser store)
- Tailwind + shadcn-style UI primitives

## Run

```bash
pnpm --filter @house-rental/oidc-admin dev
```

Optional env:

- `VITE_API_BASE_URL` (default: `http://localhost:8787`)

## Notes

- Client creation calls `POST /oidc/clients`.
- Protocol inspector calls `GET /.well-known/openid-configuration` and `GET /oidc/jwks`.
- Because the current backend MVP does not expose a list-clients endpoint, the table shows clients created from this panel store.
