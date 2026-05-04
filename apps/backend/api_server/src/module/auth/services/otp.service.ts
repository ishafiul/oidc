export class OtpService {
  generate(length = 6): string {
    if (!Number.isInteger(length) || length < 1 || length > 12) {
      throw new Error('OTP length must be an integer between 1 and 12');
    }

    const min = 10 ** (length - 1);
    const range = 9 * min;
    const value = min + this.randomInt(range);
    return value.toString();
  }

  async hashOtp(otp: string | number, jwtSecret: string): Promise<string> {
    return this.hmacSha256(this.normalizeOtp(otp), jwtSecret);
  }

  async verifyOtp(otp: string | number, expectedHash: string, jwtSecret: string): Promise<boolean> {
    const actualHash = await this.hashOtp(otp, jwtSecret);
    return this.constantTimeEqual(actualHash, expectedHash);
  }

  async hashKey(value: string, jwtSecret: string): Promise<string> {
    return this.hmacSha256(value, jwtSecret);
  }

  normalizeOtp(otp: string | number): string {
    return String(otp).trim();
  }

  isExpired(otp: { expiredAt: Date | null }): boolean {
    if (!otp.expiredAt) {
      return true;
    }
    return new Date() > otp.expiredAt;
  }

  isLocked(otp: { lockedUntil: Date | null }, now = new Date()): boolean {
    return !!otp.lockedUntil && otp.lockedUntil.getTime() > now.getTime();
  }

  isFixedTestOtpEnabled(environment: string | undefined): boolean {
    const normalized = environment?.trim().toLowerCase();
    return normalized === 'local' || normalized === 'development' || normalized === 'test';
  }

  private randomInt(exclusiveMax: number): number {
    const maxUint32 = 0x100000000;
    const limit = maxUint32 - (maxUint32 % exclusiveMax);
    const bucket = new Uint32Array(1);

    do {
      crypto.getRandomValues(bucket);
    } while (bucket[0] >= limit);

    return bucket[0] % exclusiveMax;
  }

  private async hmacSha256(value: string, jwtSecret: string): Promise<string> {
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required for OTP hashing');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    const length = Math.max(left.length, right.length);
    let diff = left.length ^ right.length;

    for (let i = 0; i < length; i += 1) {
      diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }

    return diff === 0;
  }
}

