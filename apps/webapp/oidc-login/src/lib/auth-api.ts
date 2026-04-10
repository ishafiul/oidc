type JsonRecord = Record<string, unknown>;

function readErrorMessage(parsed: unknown, status: number): string {
  if (typeof parsed === 'object' && parsed !== null) {
    const o = parsed as JsonRecord;
    const desc = o['error_description'];
    if (typeof desc === 'string' && desc) return desc;
    const msg = o['message'];
    if (typeof msg === 'string' && msg) return msg;
    const err = o['error'];
    if (typeof err === 'string' && err) return err;
  }
  return `Request failed (${status})`;
}

async function postJson<T>(apiBase: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok) {
    throw new Error(readErrorMessage(parsed, response.status));
  }
  return parsed as T;
}

export async function createDeviceUuid(apiBase: string): Promise<string> {
  const data = await postJson<{ deviceId: string }>(apiBase, '/auth/create-device-uuid', {
    deviceType: 'web',
    osName: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
  return data.deviceId;
}

export type RequestOtpResult = {
  success: boolean;
  message: string;
  accessToken?: string;
  deviceId?: string;
};

export async function requestOtp(apiBase: string, email: string, deviceUuId: string): Promise<RequestOtpResult> {
  return postJson<RequestOtpResult>(apiBase, '/auth/otp/request-otp', {
    email,
    deviceUuId,
  });
}

export type VerifyOtpResult = {
  success: boolean;
  accessToken?: string;
  deviceId?: string;
  message: string;
};

export async function verifyOtp(
  apiBase: string,
  email: string,
  otp: number,
  deviceUuId: string,
  isTrusted: boolean,
): Promise<VerifyOtpResult> {
  return postJson<VerifyOtpResult>(apiBase, '/auth/otp/verify-otp', {
    email,
    otp,
    deviceUuId,
    isTrusted,
  });
}

export type OidcAuthorizeSessionResult = {
  authorize_session: string;
  expires_in: number;
};

export async function createOidcAuthorizeSession(
  apiBase: string,
  accessToken: string,
): Promise<OidcAuthorizeSessionResult> {
  const response = await fetch(`${apiBase}/auth/oidc/authorize-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok) {
    throw new Error(readErrorMessage(parsed, response.status));
  }
  return parsed as OidcAuthorizeSessionResult;
}
