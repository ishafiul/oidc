- [ ] Use same session if possible
- [ ] Revoke session from admin panel

- [ ] High: auth/session revocation is weak.

JWTs contain only userId/email, no session id/device id/jti at jwt.service.ts (line 8). Validation only checks “any auth session exists for this user” at core/utils/auth.ts (line 40). A token can remain valid after its original device/session is replaced if another session exists. Trusted-device logout also does not delete the auth row at auth.service.ts (line 385).

Fix: include session id/device id/jti in JWTs and validate that exact active session.



- [ ]  Medium/High: OAuth code and refresh-token exchange have replay races.

Authorization code exchange reads an unconsumed code, verifies PKCE, then marks consumed in a later update at oidc/service.ts (line 944). Refresh token rotation has the same read-then-revoke shape at oidc/service.ts (line 1013). Parallel requests can potentially both pass the initial read.

Fix: atomically update consumedAt/revokedAt with WHERE ... IS NULL and require a returned row before issuing tokens.

