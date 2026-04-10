import { sign, verify } from 'hono/jwt';

const ACCESS_TOKEN_EXPIRY = 2 * 24 * 60 * 60;

export class JwtService {
  constructor(private readonly jwtSecret: string) { }

  async generateAccessToken(userId: string, email: string): Promise<string> {
    const payload = {
      userId,
      email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY,
      iat: Math.floor(Date.now() / 1000),
      type: 'access',
    };

    return await sign(payload, this.jwtSecret, 'HS256');
  }

  async verifyToken(token: string): Promise<{ userId: string; email: string }> {
    const verified = await verify(token, this.jwtSecret, 'HS256');
    return verified as { userId: string; email: string };
  }
}


