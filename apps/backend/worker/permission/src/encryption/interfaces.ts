export interface IEncryption {
	encrypt(plaintext: string): Promise<string>;
	decrypt(ciphertext: string): Promise<string>;
}

export interface EncryptionConfig {
	key: string;
	algorithm?: 'AES-GCM';
}

export class NoOpEncryption implements IEncryption {
	async encrypt(plaintext: string): Promise<string> {
		return plaintext;
	}

	async decrypt(ciphertext: string): Promise<string> {
		return ciphertext;
	}
}

