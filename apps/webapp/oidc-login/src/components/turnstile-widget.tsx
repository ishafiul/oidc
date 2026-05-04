import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          size?: 'normal' | 'compact' | 'flexible';
          theme?: 'auto' | 'dark' | 'light';
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Turnstile failed to load')), { once: true });
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function TurnstileWidget(props: {
  readonly action: string;
  readonly className?: string;
  readonly onError: () => void;
  readonly onExpire: () => void;
  readonly onToken: (token: string) => void;
  readonly resetKey: number;
  readonly siteKey: string;
  readonly theme?: 'auto' | 'dark' | 'light';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: props.siteKey,
          action: props.action,
          size: 'flexible',
          theme: props.theme ?? 'auto',
          callback: props.onToken,
          'expired-callback': props.onExpire,
          'error-callback': props.onError,
        });
      })
      .catch(() => {
        if (!cancelled) props.onError();
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [props.action, props.onError, props.onExpire, props.onToken, props.resetKey, props.siteKey, props.theme]);

  return (
    <div
      ref={containerRef}
      className={cn('mx-auto flex min-h-[65px] w-full max-w-[300px] items-center justify-center overflow-hidden', props.className)}
    />
  );
}
