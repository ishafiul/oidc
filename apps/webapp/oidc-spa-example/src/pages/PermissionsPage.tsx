import { exampleApiFetch, getStoredAccessToken } from '@/lib/access-token';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

const DEMO_DOC = 'quarterly-report';

export function PermissionsPage() {
  const [meJson, setMeJson] = useState<string | null>(null);
  const [docJson, setDocJson] = useState<string | null>(null);
  const [grantJson, setGrantJson] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [granteeSub, setGranteeSub] = useState('');

  const token = typeof sessionStorage !== 'undefined' ? getStoredAccessToken() : null;

  const loadMe = useCallback(async () => {
    setBusy('me');
    setErr(null);
    setMeJson(null);
    try {
      const res = await exampleApiFetch('/api/me');
      const text = await res.text();
      if (!res.ok) {
        setErr(`${res.status}: ${text}`);
        return;
      }
      setMeJson(JSON.stringify(JSON.parse(text) as unknown, null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }, []);

  const loadDoc = useCallback(async () => {
    setBusy('doc');
    setErr(null);
    setDocJson(null);
    try {
      const res = await exampleApiFetch(`/api/data/${encodeURIComponent(DEMO_DOC)}`);
      const text = await res.text();
      if (!res.ok) {
        setErr(`${res.status}: ${text}`);
        return;
      }
      setDocJson(JSON.stringify(JSON.parse(text) as unknown, null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }, []);

  const grantRead = useCallback(async () => {
    setBusy('grant');
    setErr(null);
    setGrantJson(null);
    const sub = granteeSub.trim();
    if (!sub) {
      setErr('Enter grantee sub (another user id from their token)');
      setBusy(null);
      return;
    }
    try {
      const res = await exampleApiFetch(`/api/data/${encodeURIComponent(DEMO_DOC)}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granteeSub: sub }),
      });
      const text = await res.text();
      if (!res.ok) {
        setErr(`${res.status}: ${text}`);
        return;
      }
      setGrantJson(JSON.stringify(JSON.parse(text) as unknown, null, 2));
      await loadMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }, [granteeSub, loadMe]);

  return (
    <div className="layout">
      <h1>Permissions demo</h1>
      <p className="muted">
        <Link to="/">Home</Link> · Small Hono API (port 8788) verifies your <strong>OIDC access token</strong> with the
        project JWKS, then enforces scopes <code>demo:data:read</code> / <code>demo:data:grant</code>.
      </p>

      {!token ? (
        <div className="card">
          <p className="err" style={{ margin: 0 }}>
            No access token in session. Sign in from the home page first, then return here.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Requests go through Vite proxy to <code>/example-api/*</code> → Hono. Token: present (Bearer).
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void loadMe()}>
              {busy === 'me' ? 'Loading…' : 'Load my permissions'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void loadDoc()}>
              {busy === 'doc' ? 'Loading…' : `Read document “${DEMO_DOC}”`}
            </button>
          </div>
          {meJson ? (
            <div style={{ marginTop: '1rem' }}>
              <h2 style={{ marginBottom: '0.5rem' }}>Your OIDC-backed view</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                <code>scopes</code> comes from the access token <code>scope</code> claim. Flags show whether this token
                can read or grant on the demo resource.
              </p>
              <pre className="dump">{meJson}</pre>
            </div>
          ) : null}
          {docJson ? (
            <div style={{ marginTop: '1rem' }}>
              <h2 style={{ marginBottom: '0.5rem' }}>Protected data</h2>
              <pre className="dump">{docJson}</pre>
            </div>
          ) : null}
        </div>
      )}

      {token ? (
        <div className="card">
          <h2>Grant read to another user</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Requires <code>demo:data:grant</code> on <em>your</em> access token. Paste another user&apos;s{' '}
            <code>sub</code> (UUID from their callback / <code>/api/me</code>).
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <input
              type="text"
              className="input"
              placeholder="grantee sub (user id)"
              value={granteeSub}
              onChange={(e) => setGranteeSub(e.target.value)}
              style={{ minWidth: '280px', flex: 1 }}
            />
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void grantRead()}>
              {busy === 'grant' ? 'Granting…' : 'POST grant'}
            </button>
          </div>
          {grantJson ? <pre className="dump" style={{ marginTop: '1rem' }}>{grantJson}</pre> : null}
        </div>
      ) : null}

      {err ? (
        <div className="card">
          <p className="err" style={{ margin: 0 }}>
            {err}
          </p>
        </div>
      ) : null}
    </div>
  );
}
