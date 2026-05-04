import z from "zod";

export const createDeviceUuidApiDto = z.object({
  deviceType: z.string().optional(),
  deviceModel: z.string().optional(),
  osName: z.string().optional(),
  osVersion: z.string().optional(),
  isPhysicalDevice: z.boolean().optional(),
  appVersion: z.string().optional(),
  fcmToken: z.string().nullish(),
}).meta({
  title: "CreateDeviceUuidApiRequest",
  description: "Request payload for creating a device UUID with basic device information",
});

export const createDeviceUuidFullDto = z.object({
  deviceType: z.string().optional(),
  deviceModel: z.string().optional(),
  osName: z.string().optional(),
  osVersion: z.string().optional(),
  isPhysicalDevice: z.boolean().optional(),
  appVersion: z.string().optional(),
  ipAddress: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  isp: z.string().optional(),
  colo: z.string().optional(),
  timezone: z.string().optional(),
  longitude: z.string().optional(),
  latitude: z.string().optional(),
  fcmToken: z.string().nullish(),
}).meta({
  title: "CreateDeviceUuidFullRequest",
  description: "Request payload for creating a device UUID with complete device and location information",
});

export const requestOtpDto = z.object({
  email: z.email(),
  deviceUuId: z.uuid(),
  turnstileToken: z.string().max(2048).optional(),
}).meta({
  title: "RequestOtpRequest",
  description: "Request payload for requesting an OTP to be sent to the user's email",
});

export const verifyOtpDto = z.object({
  email: z.email(),
  otp: z.number(),
  deviceUuId: z.uuid(),
  isTrusted: z.boolean().optional(),
}).meta({
  title: "VerifyOtpRequest",
  description: "Request payload for verifying an OTP and authenticating the user",
});

export const logoutDto = z.object({
  deviceId: z.uuid(),
}).meta({
  title: "LogoutRequest",
  description: "Request payload for logging out a user from a specific device",
});

export const refreshTokenDto = z.object({
  deviceId: z.uuid(),
}).meta({
  title: "RefreshTokenRequest",
  description: "Request payload for refreshing an access token using a device ID",
});

export const requestAdminOtpDto = z.object({
  email: z.email(),
  turnstileToken: z.string().max(2048).optional(),
}).meta({
  title: "RequestAdminOtpRequest",
  description: "Request payload for requesting an admin OTP to login from web UI",
});

export const verifyAdminOtpDto = z.object({
  email: z.email(),
  otp: z.number(),
}).meta({
  title: "VerifyAdminOtpRequest",
  description: "Request payload for verifying admin OTP and establishing cookie session",
});

export const createDeviceUuidResponseDto = z.object({
  deviceId: z.string(),
}).meta({
  title: "CreateDeviceUuidResponse",
  description: "Response containing the created device UUID",
});

export const requestOtpResponseDto = z.object({
  success: z.boolean(),
  message: z.string(),
  accessToken: z.string().optional(),
  deviceId: z.string().optional(),
}).meta({
  title: "RequestOtpResponse",
  description: "Response indicating the success of OTP request, optionally including access token and device ID",
});

export const verifyOtpResponseDto = z.object({
  success: z.boolean(),
  accessToken: z.string().optional(),
  deviceId: z.string().optional(),
  message: z.string(),
}).meta({
  title: "VerifyOtpResponse",
  description: "Response containing authentication result with access token and device ID on successful verification",
});

export const logoutResponseDto = z.object({
  success: z.boolean(),
}).meta({
  title: "LogoutResponse",
  description: "Response indicating the success of the logout operation",
});

export const refreshTokenResponseDto = z.object({
  accessToken: z.string(),
}).meta({
  title: "RefreshTokenResponse",
  description: "Response containing the new access token after refresh",
});

export const requestAdminOtpResponseDto = z.object({
  success: z.boolean(),
  message: z.string(),
}).meta({
  title: "RequestAdminOtpResponse",
  description: "Response indicating admin OTP request result",
});

export const verifyAdminOtpResponseDto = z.object({
  success: z.boolean(),
  message: z.string(),
  accessToken: z.string(),
  csrfToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
}).meta({
  title: "VerifyAdminOtpResponse",
  description: "Response indicating successful admin OTP verification and cookie session setup",
});

export const adminSessionResponseDto = z.object({
  authenticated: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }).nullable(),
}).meta({
  title: "AdminSessionResponse",
  description: "Response containing current admin session status",
});

export const createOidcAuthorizeSessionResponseDto = z
  .object({
    authorize_session: z.string(),
    expires_in: z.number(),
  })
  .meta({
    title: "CreateOidcAuthorizeSessionResponse",
    description: "One-time session value for OIDC authorize after email OTP",
  });

export type CreateDeviceUuidApiDto = z.infer<typeof createDeviceUuidApiDto>;
export type CreateDeviceUuidFullDto = z.infer<typeof createDeviceUuidFullDto>;
export type RequestOtpDto = z.infer<typeof requestOtpDto>;
export type VerifyOtpDto = z.infer<typeof verifyOtpDto>;
export type LogoutDto = z.infer<typeof logoutDto>;
export type RefreshTokenDto = z.infer<typeof refreshTokenDto>;
export type RequestAdminOtpDto = z.infer<typeof requestAdminOtpDto>;
export type VerifyAdminOtpDto = z.infer<typeof verifyAdminOtpDto>;
