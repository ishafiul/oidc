export class OtpService {
  generate(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  isExpired(otp: { expiredAt: Date | null }): boolean {
    if (!otp.expiredAt) {
      return true;
    }
    return new Date() > otp.expiredAt;
  }
}


