import { useEffect, useState } from 'react';

const CALLBACK_KEYS = ['code', 'state', 'error', 'error_description'] as const;

export function OidcAppRedirectBridge() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const redirectUri = q.get('redirect_uri')?.trim();
    if (!redirectUri) {
      setMessage('Missing redirect_uri');
      return;
    }
    try {
      const target = new URL(redirectUri);
      for (const key of CALLBACK_KEYS) {
        const v = q.get(key);
        if (v) {
          target.searchParams.set(key, v);
        }
      }
      window.location.replace(target.toString());
    } catch {
      setMessage('Invalid redirect_uri');
    }
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? 'Returning to the app…'}
      </p>
    </div>
  );
}
