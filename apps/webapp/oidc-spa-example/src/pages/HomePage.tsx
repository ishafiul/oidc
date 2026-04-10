import { discoveryUrl, getOidcConfig } from '@/lib/config';
import { buildAuthorizationUrl, fetchDiscovery } from '@/lib/oidc';
import { createCodeChallengeS256, createCodeVerifier, createNonce, createState } from '@/lib/pkce';
import { sessionKeys } from '@/lib/session';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function HomePage() {
  const cfg = getOidcConfig();
  const [discoveryJson, setDiscoveryJson] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cfg.apiOrigin || !cfg.projectSlug) {
      setLoadErr('Set VITE_API_ORIGIN and VITE_OIDC_PROJECT_SLUG in .env.development');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await fetchDiscovery(discoveryUrl(cfg.apiOrigin, cfg.projectSlug));
        if (cancelled) return;
        setDiscoveryJson(JSON.stringify(d, null, 2));
        setLoadErr(null);
      } catch (e) {
        if (cancelled) return;
        setDiscoveryJson(null);
        setLoadErr(e instanceof Error ? e.message : 'Discovery failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg.apiOrigin, cfg.projectSlug]);

  const startLogin = useCallback(async () => {
    setBusy(true);
    setLoadErr(null);
    try {
      if (!cfg.clientId || !cfg.redirectUri) {
        throw new Error('Set VITE_OIDC_CLIENT_ID and VITE_OIDC_REDIRECT_URI');
      }
      const discovery = await fetchDiscovery(discoveryUrl(cfg.apiOrigin, cfg.projectSlug));
      const verifier = createCodeVerifier();
      const state = createState();
      const nonce = createNonce();
      const challenge = await createCodeChallengeS256(verifier);
      sessionStorage.setItem(sessionKeys.codeVerifier, verifier);
      sessionStorage.setItem(sessionKeys.state, state);
      sessionStorage.setItem(sessionKeys.nonce, nonce);
      const url = buildAuthorizationUrl({
        authorizationEndpoint: discovery.authorization_endpoint,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scope: cfg.scope,
        state,
        codeChallenge: challenge,
        nonce,
      });
      window.location.assign(url);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to start login');
      setBusy(false);
    }
  }, [cfg]);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(sessionKeys.codeVerifier);
    sessionStorage.removeItem(sessionKeys.state);
    sessionStorage.removeItem(sessionKeys.nonce);
    sessionStorage.removeItem(sessionKeys.tokenJson);
    sessionStorage.removeItem(sessionKeys.userinfoJson);
    window.location.reload();
  }, []);

  const hasTokens = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKeys.tokenJson);

  return (
    <div className="layout">
      <h1>OIDC SPA example</h1>
      <p className="muted">
        PKCE authorization code flow against your API. Callback:{' '}
        <Link to="/callback">/callback</Link>
        {' · '}
        <Link to="/permissions">Permissions demo</Link> (Hono + OIDC scopes)
      </p>

      <div className="card">
        <h2>Config</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>
            API: <code>{cfg.apiOrigin || '(missing)'}</code>
          </li>
          <li>
            Project: <code>{cfg.projectSlug || '(missing)'}</code>
          </li>
          <li>
            Client ID: <code>{cfg.clientId || '(missing)'}</code>
          </li>
          <li>
            Redirect URI: <code>{cfg.redirectUri || '(missing)'}</code>
          </li>
        </ul>
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => void startLogin()}>
            {busy ? 'Redirecting…' : 'Sign in with OIDC'}
          </button>
          {hasTokens ? (
            <button type="button" className="btn btn-secondary" onClick={clearSession}>
              Clear stored tokens
            </button>
          ) : null}
        </div>
        {loadErr ? <p className="err">{loadErr}</p> : null}
      </div>

      <div className="card">
        <h2>Discovery</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          <code>{discoveryUrl(cfg.apiOrigin || 'http://localhost:8787', cfg.projectSlug || 'default')}</code>
        </p>
        {discoveryJson ? <pre className="dump">{discoveryJson}</pre> : !loadErr ? <p className="muted">Loading…</p> : null}
      </div>

      {hasTokens ? (
        <div className="card">
          <h2>Last session</h2>
          <p className="muted">Tokens are in sessionStorage. Open <Link to="/callback">/callback</Link> after sign-in, or clear and run again.</p>
          <Link to="/callback">View callback result</Link>
        </div>
      ) : null}
    </div>
  );
}
