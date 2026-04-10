import { IEncryption, EncryptionConfig } from './interfaces';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;

export class AESEncryption implements IEncryption {
	private keyPromise: Promise<CryptoKey>;

	constructor(config: EncryptionConfig) {
		this.keyPromise = this.deriveKey(config.key);
	}

	private async deriveKey(keyString: string): Promise<CryptoKey> {
		const encoder = new TextEncoder();
		const keyData = encoder.encode(keyString);

		const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);

		return crypto.subtle.importKey('raw', hashBuffer, { name: ALGORITHM }, false, [
			'encrypt',
			'decrypt',
		]);
	}

	async encrypt(plaintext: string): Promise<string> {
		const key = await this.keyPromise;
		const encoder = new TextEncoder();
		const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

		const encrypted = await crypto.subtle.encrypt(
			{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
			key,
			encoder.encode(plaintext)
		);

		const combined = new Uint8Array(iv.length + encrypted.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);

		return this.arrayBufferToBase64(combined);
	}

	async decrypt(ciphertext: string): Promise<string> {
		const key = await this.keyPromise;
		const combined = this.base64ToArrayBuffer(ciphertext);

		const iv = combined.slice(0, IV_LENGTH);
		const encrypted = combined.slice(IV_LENGTH);

		const decrypted = await crypto.subtle.decrypt(
			{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
			key,
			encrypted
		);

		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	}

	private arrayBufferToBase64(buffer: Uint8Array): string {
		let binary = '';
		for (let i = 0; i < buffer.length; i++) {
			binary += String.fromCharCode(buffer[i]);
		}
		return btoa(binary);
	}

	private base64ToArrayBuffer(base64: string): Uint8Array {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
}

export function createEncryption(key?: string): IEncryption {
	if (!key) {
		return {
			async encrypt(plaintext: string) {
				return plaintext;
			},
			async decrypt(ciphertext: string) {
				return ciphertext;
			},
		};
	}
	return new AESEncryption({ key });
}

