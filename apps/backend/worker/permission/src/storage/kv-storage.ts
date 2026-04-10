import { IEncryption } from '../encryption/interfaces';
import { IStorage, StorageOptions } from './interfaces';

export class KVStorage implements IStorage {
	private readonly encryption?: IEncryption;

	constructor(
		private readonly kv: KVNamespace,
		options?: StorageOptions
	) {
		this.encryption = options?.encryption;
	}

	async get(key: string): Promise<string | null> {
		const value = await this.kv.get(key);
		if (!value) return null;
		if (this.encryption) {
			return this.encryption.decrypt(value);
		}
		return value;
	}

	async put(key: string, value: string): Promise<void> {
		const storedValue = this.encryption ? await this.encryption.encrypt(value) : value;
		await this.kv.put(key, storedValue);
	}

	async delete(key: string): Promise<void> {
		await this.kv.delete(key);
	}

	async list(options: { prefix: string }): Promise<{ keys: { name: string }[] }> {
		return this.kv.list({ prefix: options.prefix });
	}
}

