import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TurnstileWidget } from '@/components/turnstile-widget';
import {
  createDeviceUuid,
  createOidcAuthorizeSession,
  requestOtp,
  verifyOtp,
  type RequestOtpResult,
  type VerifyOtpResult,
} from '@/lib/auth-api';
import {
  appendOidcAuthorizeSession,
  getApiOriginFromEnv,
  normalizeApiBase,
  parseAuthorizeReturnUrl,
} from '@/lib/return-url';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';

const DEVICE_KEY = 'house_rental_oidc_login_device_id';
const OTP_LEN = 6;

function readReturnUrlFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('return_url');
  return raw?.trim() || null;
}

function projectLabelFromAuthorizeUrl(url: URL): string | null {
  const m = url.pathname.match(/\/projects\/([^/]+)\/oidc\/authorize\/?$/);
  return m?.[1] ?? null;
}

export function LoginApp() {
  const apiBase = normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? '');
  const apiOrigin = getApiOriginFromEnv(import.meta.env.VITE_API_BASE_URL ?? '');
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
  const turnstileEnabled = Boolean(turnstileSiteKey);

  const returnUrlRaw = useMemo(() => readReturnUrlFromLocation(), []);
  const returnParsed = useMemo(() => {
    if (!returnUrlRaw || !apiOrigin) return { ok: false as const };
    return parseAuthorizeReturnUrl(returnUrlRaw, apiOrigin);
  }, [returnUrlRaw, apiOrigin]);

  const projectHint = returnParsed.ok ? projectLabelFromAuthorizeUrl(returnParsed.url) : null;

  const deviceQuery = useQuery({
    queryKey: ['oidc-login-device', apiBase],
    enabled: Boolean(apiBase),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const id = await createDeviceUuid(apiBase);
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    },
  });

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [signedInNoRedirect, setSignedInNoRedirect] = useState(false);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken('');
    if (turnstileEnabled) setTurnstileResetKey((value) => value + 1);
  }, [turnstileEnabled]);

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(null);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
    setTurnstileError('Security check expired. Please retry.');
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
    setTurnstileError('Security check failed to load. Please retry.');
  }, []);

  const redirectAfterOidcAuth = useCallback(
    async (accessToken: string, emailForHint: string) => {
      if (!returnParsed.ok) return;
      const session = await createOidcAuthorizeSession(apiBase, accessToken);
      window.location.assign(
        appendOidcAuthorizeSession(returnParsed.url, emailForHint, session.authorize_session),
      );
    },
    [apiBase, returnParsed],
  );

  const requestMutation = useMutation({
    mutationFn: async () => requestOtp(apiBase, email.trim(), deviceQuery.data ?? '', turnstileToken || undefined),
    onSuccess: async (result: RequestOtpResult) => {
      setErrorMessage(null);
      if (result.accessToken) {
        if (returnParsed.ok) {
          try {
            await redirectAfterOidcAuth(result.accessToken, email.trim());
          } catch (e) {
            setErrorMessage(e instanceof Error ? e.message : 'Could not continue to the app');
          }
          return;
        }
        setSignedInNoRedirect(true);
        return;
      }
      setOtpSent(true);
    },
    onError: (e) => {
      setErrorMessage(e instanceof Error ? e.message : 'Could not send code');
    },
    onSettled: () => {
      resetTurnstile();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () =>
      verifyOtp(apiBase, email.trim(), Number(otp), deviceQuery.data ?? '', trustDevice),
    onSuccess: async (result: VerifyOtpResult) => {
      setErrorMessage(null);
      if (returnParsed.ok) {
        const token = result.accessToken;
        if (!token) {
          setErrorMessage('Missing access token');
          return;
        }
        try {
          await redirectAfterOidcAuth(token, email.trim());
        } catch (e) {
          setErrorMessage(e instanceof Error ? e.message : 'Could not continue to the app');
        }
        return;
      }
      setSignedInNoRedirect(true);
    },
    onError: (e) => {
      setErrorMessage(e instanceof Error ? e.message : 'Invalid code');
    },
  });

  const onOtpInput = useCallback((raw: string) => {
    setOtp(raw.replace(/\D/g, '').slice(0, OTP_LEN));
  }, []);

  const backToEmail = useCallback(() => {
    setOtpSent(false);
    setOtp('');
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!deviceQuery.data) return;
      if (!otpSent) {
        if (turnstileEnabled && !turnstileToken) return;
        if (email.trim()) requestMutation.mutate();
        return;
      }
      if (otp.length === OTP_LEN) verifyMutation.mutate();
    },
    [deviceQuery.data, email, otp.length, otpSent, requestMutation, turnstileEnabled, turnstileToken, verifyMutation],
  );

  const busy =
    deviceQuery.isLoading ||
    deviceQuery.isFetching ||
    requestMutation.isPending ||
    verifyMutation.isPending;
  const requestDisabled = busy || !email.trim() || (turnstileEnabled && !turnstileToken);

  if (!apiBase || !apiOrigin) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Set <span className="font-mono text-foreground/90">VITE_API_BASE_URL</span> to your API origin
          (e.g. http://localhost:8787).
        </p>
      </div>
    );
  }

  if (returnUrlRaw && !returnParsed.ok) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="mb-4 h-10 w-10 text-primary" aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">
          This sign-in link is invalid or does not match this server. Open the app again and retry.
        </p>
      </div>
    );
  }

  if (deviceQuery.isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-red-300">
          {deviceQuery.error instanceof Error ? deviceQuery.error.message : 'Could not start session'}
        </p>
      </div>
    );
  }

  if (signedInNoRedirect) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
        </div>
        <h1 className="font-display text-xl font-semibold text-foreground">Signed in</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          You can return to the app. This page had no OIDC return URL.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col justify-center px-4 py-10 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div
        className="pointer-events-none absolute left-1/2 top-[8%] h-40 w-[min(100%,28rem)] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[min(100%,24rem)] animate-rise-in">
        <header className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-md">
            <KeyRound className="h-3.5 w-3.5 text-primary" aria-hidden />
            Secure sign-in
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {projectHint ? `Continue to ${projectHint}` : 'Sign in'}
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {returnParsed.ok
              ? 'Verify your email to authorize the application.'
              : 'Email sign-in with a one-time code.'}
          </p>
        </header>

        <div className="login-glass relative overflow-hidden rounded-[1.25rem] border border-border/80 bg-card/70 p-6 backdrop-blur-xl sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -18deg,
                transparent,
                transparent 10px,
                hsl(var(--primary)) 10px,
                hsl(var(--primary)) 11px
              )`,
            }}
            aria-hidden
          />

          <div className="relative z-[1] space-y-6">
            <div className="flex gap-2" aria-label="Steps">
              <StepPill active={!otpSent} done={otpSent} label="Email" n={1} />
              <StepPill active={otpSent} done={false} label="Code" n={2} />
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              {!otpSent ? (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    autoComplete="email"
                    enterKeyHint="send"
                    inputMode="email"
                    name="email"
                    placeholder="you@example.com"
                    spellCheck={false}
                    type="email"
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <Label htmlFor="otp">Verification code</Label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={backToEmail}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Change email
                    </button>
                  </div>
                  <Input
                    id="otp"
                    autoComplete="one-time-code"
                    className="h-[3.25rem] min-h-[3.25rem] text-center font-mono text-2xl tracking-[0.4em] sm:text-3xl sm:tracking-[0.45em]"
                    enterKeyHint="done"
                    inputMode="numeric"
                    maxLength={OTP_LEN}
                    name="otp"
                    pattern="\d*"
                    placeholder="••••••"
                    value={otp}
                    disabled={busy}
                    onChange={(e) => onOtpInput(e.target.value)}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    {OTP_LEN}-digit code sent to <span className="font-medium text-foreground">{email}</span>
                  </p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      disabled={busy}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <span className="text-xs leading-snug text-muted-foreground">
                      <span className="font-medium text-foreground">Trust this browser</span>
                      <span className="mt-0.5 block opacity-90">Skip the code next time on this device.</span>
                    </span>
                  </label>
                </div>
              )}

              {turnstileEnabled ? (
                <div className="space-y-2">
                  <TurnstileWidget
                    action="user-otp-request"
                    className="border border-border/60 bg-background/30"
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                    onToken={handleTurnstileToken}
                    resetKey={turnstileResetKey}
                    siteKey={turnstileSiteKey}
                  />
                  {turnstileError ? (
                    <p className="text-center text-xs text-red-200" role="alert">
                      {turnstileError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!otpSent ? (
                <Button className="w-full" disabled={requestDisabled} size="lg" type="submit">
                  {requestMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    'Send code'
                  )}
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button className="w-full" disabled={busy || otp.length !== OTP_LEN} size="lg" type="submit">
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Verifying…
                      </>
                    ) : returnParsed.ok ? (
                      'Continue'
                    ) : (
                      'Verify'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-border/70"
                    disabled={requestDisabled}
                    onClick={() => requestMutation.mutate()}
                  >
                    Resend code
                  </Button>
                </div>
              )}
            </form>

            {errorMessage ? (
              <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-3 text-sm text-red-200" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/85 sm:text-xs">
          Protected by your organization&apos;s identity service.
        </p>
      </div>
    </div>
  );
}

function StepPill(props: { readonly active: boolean; readonly done: boolean; readonly label: string; readonly n: number }) {
  const { active, done, label, n } = props;
  return (
    <div
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide sm:text-xs ${
        active
          ? 'border-primary/45 bg-primary/15 text-foreground'
          : done
            ? 'border-border/60 bg-secondary/50 text-muted-foreground'
            : 'border-border/50 bg-muted/25 text-muted-foreground/75'
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
          active || done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : n}
      </span>
      {label}
    </div>
  );
}
