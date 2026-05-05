import { sign, verify } from 'hono/jwt';

const ACCESS_TOKEN_EXPIRY = 2 * 24 * 60 * 60;

export type AccessTokenPayload = {
  userId: string;
  email: string;
  sessionId: string;
  deviceId: string;
  jti: string;
  exp: number;
  iat: number;
  type: 'access';
};

type GenerateAccessTokenInput = {
  userId: string;
  email: string;
  sessionId: string;
  deviceId: string;
};

export class JwtService {
  constructor(private readonly jwtSecret: string) { }

  async generateAccessToken(input: GenerateAccessTokenInput): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      userId: input.userId,
      email: input.email,
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      jti: input.sessionId,
      exp: now + ACCESS_TOKEN_EXPIRY,
      iat: now,
      type: 'access',
    };

    return await sign(payload, this.jwtSecret, 'HS256');
  }

  async verifyToken(token: string): Promise<AccessTokenPayload> {
    const verified = await verify(token, this.jwtSecret, 'HS256');
    return assertAccessTokenPayload(verified);
  }
}

function assertAccessTokenPayload(payload: unknown): AccessTokenPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid token payload');
  }

  const token = payload as Record<string, unknown>;
  if (
    typeof token.userId !== 'string' ||
    typeof token.email !== 'string' ||
    typeof token.sessionId !== 'string' ||
    typeof token.deviceId !== 'string' ||
    typeof token.jti !== 'string' ||
    typeof token.exp !== 'number' ||
    typeof token.iat !== 'number' ||
    token.type !== 'access' ||
    token.jti !== token.sessionId
  ) {
    throw new Error('Invalid access token claims');
  }

  return token as AccessTokenPayload;
}
