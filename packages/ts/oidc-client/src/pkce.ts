function uint8ArrayToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] ?? 0);
	}
	const b64 = btoa(binary);
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkceVerifier(): string {
	const bytes = new Uint8Array(64);
	crypto.getRandomValues(bytes);
	return uint8ArrayToBase64Url(bytes);
}

export async function pkceChallengeS256(verifier: string): Promise<string> {
	const data = new TextEncoder().encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return uint8ArrayToBase64Url(new Uint8Array(digest));
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = generatePkceVerifier();
	const challenge = await pkceChallengeS256(verifier);
	return { verifier, challenge };
}
