import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestAdminOtp, setAdminAccessToken, setAdminCsrfToken, verifyAdminOtp } from '@/lib/api';
import { useAdminStore } from '@/stores/admin-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check, Loader2, Mail } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';

const OTP_LENGTH = 5;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const apiBaseUrl = useAdminStore((state) => state.apiBaseUrl);
  const setSessionUser = useAdminStore((state) => state.setSessionUser);
  const setSessionLoaded = useAdminStore((state) => state.setSessionLoaded);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestOtpMutation = useMutation({
    mutationFn: async () => requestAdminOtp(apiBaseUrl, email),
    onSuccess: () => {
      setOtpRequested(true);
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to request OTP');
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => verifyAdminOtp(apiBaseUrl, email, Number(otp)),
    onSuccess: async (result) => {
      setAdminAccessToken(result.accessToken);
      setAdminCsrfToken(result.csrfToken);
      setSessionUser(result.user);
      setSessionLoaded(true);
      setErrorMessage(null);
      await queryClient.invalidateQueries();
      void navigate({ to: '/dashboard' });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to verify OTP');
    },
  });

  const onOtpChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
  }, []);

  const goBackToEmail = useCallback(() => {
    setOtpRequested(false);
    setOtp('');
    setErrorMessage(null);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!otpRequested) {
        if (email.trim()) requestOtpMutation.mutate();
        return;
      }
      if (otp.length === OTP_LENGTH) verifyOtpMutation.mutate();
    },
    [email, otp.length, otpRequested, requestOtpMutation, verifyOtpMutation],
  );

  const busy = requestOtpMutation.isPending || verifyOtpMutation.isPending;

  return (
    <div className="relative flex min-h-[100dvh] flex-col justify-center px-4 py-8 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div
        className="pointer-events-none absolute inset-x-0 top-[12%] mx-auto h-48 max-w-lg rounded-full bg-accent/20 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[min(100%,26rem)] animate-rise-in">
        <header className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground shadow-sm backdrop-blur-sm">
            <Mail className="h-3.5 w-3.5 text-primary" aria-hidden />
            OIDC admin
          </div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground sm:text-4xl sm:leading-tight">
            Sign in
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
            We email you a one-time code. No password to remember.
          </p>
        </header>

        <div
          className="access-ledger-hero access-ledger-matrix relative overflow-hidden rounded-[1.35rem] border border-border/90 bg-card/85 p-6 shadow-panel backdrop-blur-md sm:p-8"
          style={{ animationDelay: '80ms' }}
        >
          <div className="access-ledger-noise" aria-hidden />
          <div className="relative z-[1] space-y-6">
            <div className="flex gap-2" role="list" aria-label="Sign-in steps">
              <StepPill active={!otpRequested} done={otpRequested} label="Email" step={1} />
              <StepPill active={otpRequested} done={false} label="Code" step={2} />
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              {!otpRequested ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="email">
                    Work email
                  </Label>
                  <Input
                    id="email"
                    autoComplete="email"
                    className="h-12 min-h-12 border-border/90 bg-background/80 text-base sm:text-sm"
                    enterKeyHint="send"
                    inputMode="email"
                    name="email"
                    placeholder="you@company.com"
                    spellCheck={false}
                    type="email"
                    value={email}
                    disabled={busy}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <Label className="text-sm font-medium" htmlFor="otp">
                      Code from email
                    </Label>
                    <button
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      type="button"
                      disabled={busy}
                      onClick={goBackToEmail}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Different email
                    </button>
                  </div>
                  <Input
                    id="otp"
                    autoComplete="one-time-code"
                    className="h-14 min-h-14 border-border/90 bg-background/80 text-center font-mono text-2xl tracking-[0.35em] text-foreground sm:text-3xl sm:tracking-[0.4em]"
                    enterKeyHint="done"
                    inputMode="numeric"
                    maxLength={OTP_LENGTH}
                    name="otp"
                    pattern="\d*"
                    placeholder="•••••"
                    value={otp}
                    disabled={busy}
                    onChange={(event) => onOtpChange(event.target.value)}
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    {OTP_LENGTH}-digit code sent to{' '}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>
              )}

              {!otpRequested ? (
                <Button
                  className="h-12 w-full text-base font-semibold shadow-lg shadow-primary/20 sm:text-sm"
                  disabled={busy || !email.trim()}
                  size="lg"
                  type="submit"
                >
                  {requestOtpMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Sending code…
                    </>
                  ) : (
                    'Email me a code'
                  )}
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button
                    className="h-12 w-full text-base font-semibold shadow-lg shadow-primary/20 sm:text-sm"
                    disabled={busy || otp.length !== OTP_LENGTH}
                    size="lg"
                    type="submit"
                  >
                    {verifyOtpMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Verifying…
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                  <Button
                    className="h-11 w-full"
                    disabled={busy}
                    type="button"
                    variant="outline"
                    onClick={() => requestOtpMutation.mutate()}
                  >
                    Resend code
                  </Button>
                </div>
              )}
            </form>

            {errorMessage ? (
              <p
                className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-3 text-sm leading-snug text-destructive"
                role="alert"
                aria-live="polite"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/90 sm:text-xs">
          Secured session after sign-in. Use an account with admin access.
        </p>
      </div>
    </div>
  );
}

function StepPill(props: { readonly active: boolean; readonly done: boolean; readonly label: string; readonly step: number }) {
  const { active, done, label, step } = props;
  return (
    <div
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors sm:text-[13px] ${
        active
          ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/20'
          : done
            ? 'border-border/80 bg-secondary/40 text-muted-foreground'
            : 'border-border/60 bg-muted/30 text-muted-foreground/80'
      }`}
      role="listitem"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          active || done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> : step}
      </span>
      {label}
    </div>
  );
}
