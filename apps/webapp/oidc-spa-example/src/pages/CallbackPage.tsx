import { discoveryUrl, getOidcConfig } from '@/lib/config';
import { decodeJwtPayloadSegment } from '@/lib/jwt-display';
import { exchangeAuthorizationCode, fetchDiscovery, fetchUserInfo } from '@/lib/oidc';
import { sessionKeys } from '@/lib/session';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function CallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [idTokenClaims, setIdTokenClaims] = useState<string | null>(null);
  const [userinfoPreview, setUserinfoPreview] = useState<string | null>(null);

  useEffect(() => {
    const cfg = getOidcConfig();
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const errDesc = params.get('error_description');
    if (err) {
      setStatus('error');
      setMessage(`${err}${errDesc ? `: ${errDesc}` : ''}`);
      return;
    }

    const code = params.get('code');
    const state = params.get('state');
    const storedState = sessionStorage.getItem(sessionKeys.state);
    const verifier = sessionStorage.getItem(sessionKeys.codeVerifier);

    if (!code || !state) {
      const stored = sessionStorage.getItem(sessionKeys.tokenJson);
      if (stored) {
        setStatus('done');
        setMessage('No OAuth params in URL — showing last token response from this browser tab.');
        setTokenPreview(stored);
        try {
          const t = JSON.parse(stored) as { id_token?: string };
          if (t.id_token) {
            const claims = decodeJwtPayloadSegment(t.id_token);
            setIdTokenClaims(claims ? JSON.stringify(claims, null, 2) : null);
          }
        } catch {
          setIdTokenClaims(null);
        }
        setUserinfoPreview(sessionStorage.getItem(sessionKeys.userinfoJson));
        return;
      }
      setStatus('error');
      setMessage('Missing code or state. Start from home and complete sign-in, or open this page right after the IdP redirects here.');
      return;
    }
    if (!storedState || state !== storedState) {
      setStatus('error');
      setMessage('State mismatch — try signing in again from the home page');
      return;
    }
    if (!verifier) {
      setStatus('error');
      setMessage('Missing PKCE verifier — start login from the home page');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (!cfg.apiOrigin || !cfg.projectSlug || !cfg.clientId || !cfg.redirectUri) {
          throw new Error('Missing env: VITE_API_ORIGIN, VITE_OIDC_PROJECT_SLUG, VITE_OIDC_CLIENT_ID, VITE_OIDC_REDIRECT_URI');
        }
        const secret = import.meta.env.VITE_OIDC_CLIENT_SECRET?.trim();
        const discovery = await fetchDiscovery(discoveryUrl(cfg.apiOrigin, cfg.projectSlug));
        const tokens = await exchangeAuthorizationCode({
          tokenEndpoint: discovery.token_endpoint,
          clientId: cfg.clientId,
          clientSecret: secret || undefined,
          code,
          redirectUri: cfg.redirectUri,
          codeVerifier: verifier,
        });
        if (cancelled) return;

        sessionStorage.removeItem(sessionKeys.codeVerifier);
        sessionStorage.removeItem(sessionKeys.state);
        sessionStorage.removeItem(sessionKeys.nonce);
        sessionStorage.setItem(sessionKeys.tokenJson, JSON.stringify(tokens, null, 2));

        setTokenPreview(JSON.stringify(tokens, null, 2));

        if (tokens.id_token) {
          const claims = decodeJwtPayloadSegment(tokens.id_token);
          setIdTokenClaims(claims ? JSON.stringify(claims, null, 2) : '(could not decode id_token payload)');
        } else {
          setIdTokenClaims(null);
        }

        if (discovery.userinfo_endpoint) {
          try {
            const ui = await fetchUserInfo(discovery.userinfo_endpoint, tokens.access_token);
            if (cancelled) return;
            const pretty = JSON.stringify(ui, null, 2);
            sessionStorage.setItem(sessionKeys.userinfoJson, pretty);
            setUserinfoPreview(pretty);
          } catch (e) {
            if (cancelled) return;
            setUserinfoPreview(e instanceof Error ? e.message : 'UserInfo failed');
          }
        } else {
          setUserinfoPreview('(no userinfo_endpoint in discovery)');
        }

        setStatus('done');
        setMessage('Token exchange completed.');
        window.history.replaceState({}, '', '/callback');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Callback failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="layout">
      <h1>OIDC callback</h1>
      <p className="muted">
        <Link to="/">Home</Link>
      </p>

      <div className="card">
        {status === 'working' ? <p>Finishing sign-in…</p> : null}
        {status !== 'working' ? (
          <>
            <p style={{ margin: 0 }}>{message}</p>
            {status === 'done' ? (
              <div className="row">
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
                  Back to home
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {tokenPreview ? (
        <div className="card">
          <h2>Token response</h2>
          <pre className="dump">{tokenPreview}</pre>
        </div>
      ) : null}

      {idTokenClaims ? (
        <div className="card">
          <h2>ID token payload (decoded, not verified)</h2>
          <pre className="dump">{idTokenClaims}</pre>
        </div>
      ) : null}

      {userinfoPreview ? (
        <div className="card">
          <h2>UserInfo</h2>
          <pre className="dump">{userinfoPreview}</pre>
        </div>
      ) : null}
    </div>
  );
}
