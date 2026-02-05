import type {
	RequestSigningConfig,
	SignRequestInput,
	SignRequestResult,
	SignatureHeaders,
	VerifyRequestInput,
	VerifyRequestResult,
	NonceStore,
	VerificationFailureReason,
} from "../../types/security";

/** Default timestamp tolerance: 5 minutes */
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** Default nonce TTL: 10 minutes */
const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;

/** Default HMAC algorithm */
const DEFAULT_ALGORITHM = "SHA-256";

/**
 * Maps algorithm names to their Web Crypto equivalents.
 */
const ALGORITHM_MAP: Record<string, string> = {
	"SHA-256": "SHA-256",
	"SHA-384": "SHA-384",
	"SHA-512": "SHA-512",
};

/**
 * Converts a Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Encodes a string to Uint8Array using UTF-8.
 */
function stringToBytes(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

type CanonicalInput = {
	method: string;
	path: string;
	timestamp: number;
	nonce?: string;
	bodyHash: string;
};

/**
 * Creates the canonical string to sign from request components.
 * Format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_HASH
 */
function createCanonicalString(input: CanonicalInput): string {
	const parts = [
		input.method.toUpperCase(),
		input.path,
		input.timestamp.toString(),
		input.nonce ?? "",
		input.bodyHash,
	];
	return parts.join("\n");
}

/**
 * Computes SHA-256 hash of the given data.
 */
async function computeHash(
	data: string,
	algorithm: string,
): Promise<string> {
	const hashBuffer = await crypto.subtle.digest(
		algorithm,
		stringToBytes(data),
	);
	return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Computes HMAC signature using the Web Crypto API.
 */
async function computeHmac(
	secret: string,
	data: string,
	algorithm: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		stringToBytes(secret),
		{ name: "HMAC", hash: algorithm },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		stringToBytes(data),
	);

	return bytesToHex(new Uint8Array(signature));
}

/**
 * Performs constant-time comparison of two strings.
 * Prevents timing attacks on signature comparison.
 */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	const aBytes = stringToBytes(a);
	const bBytes = stringToBytes(b);

	let result = 0;
	for (let i = 0; i < aBytes.length; i++) {
		result |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
	}

	return result === 0;
}

/**
 * Creates a request signer with the given configuration.
 *
 * @example
 * ```typescript
 * const signer = createRequestSigner({
 *   secret: "your-secret-key",
 *   algorithm: "SHA-256",
 * });
 *
 * // Sign a request
 * const { headers } = await signer.sign({
 *   method: "POST",
 *   path: "/upload-url",
 *   body: JSON.stringify({ fileInfo: { ... } }),
 * });
 *
 * // Include headers in your request
 * fetch("/api/storage/upload-url", {
 *   method: "POST",
 *   headers: {
 *     "Content-Type": "application/json",
 *     ...headers,
 *   },
 *   body: JSON.stringify({ fileInfo: { ... } }),
 * });
 * ```
 */
type SignerConfig = {
	config: RequestSigningConfig;
	algorithm: string;
};

type VerifyContext = {
	input: VerifyRequestInput;
	nonceStore?: NonceStore;
	timestampTolerance: number;
	nonceTtl: number;
	requireNonce: boolean;
	algorithm: string;
	secret: string;
};

function resolveAlgorithm(config: RequestSigningConfig): string {
	const algorithm = ALGORITHM_MAP[config.algorithm ?? DEFAULT_ALGORITHM];
	if (!algorithm) {
		throw new Error(`Unsupported algorithm: ${config.algorithm}`);
	}
	return algorithm;
}

async function signRequest(
	input: SignRequestInput,
	context: SignerConfig,
): Promise<SignRequestResult> {
	const timestamp = input.timestamp ?? Date.now();
	const bodyHash = await computeHash(input.body ?? "", context.algorithm);
	const canonicalString = createCanonicalString({
		method: input.method,
		path: input.path,
		timestamp,
		nonce: input.nonce,
		bodyHash,
	});
	const signature = await computeHmac(context.config.secret, canonicalString, context.algorithm);
	const headers: SignatureHeaders = {
		"x-signature": signature,
		"x-timestamp": timestamp.toString(),
	};

	if (input.nonce) {
		headers["x-nonce"] = input.nonce;
	}

	return {
		signature,
		timestamp,
		nonce: input.nonce,
		headers,
	};
}

function validateTimestamp(
	timestamp: number,
	toleranceMs: number,
): VerificationFailureReason | null {
	if (!Number.isFinite(timestamp)) {
		return "timestamp_invalid";
	}

	const now = Date.now();
	const age = Math.abs(now - timestamp);
	if (age > toleranceMs) {
		return "timestamp_expired";
	}

	return null;
}

async function validateNonce(
	context: VerifyContext,
): Promise<VerificationFailureReason | null> {
	if (context.requireNonce && !context.input.nonce) {
		return "nonce_missing";
	}

	if (context.requireNonce && !context.nonceStore) {
		return "nonce_store_missing";
	}

	if (!context.input.nonce || !context.nonceStore) {
		return null;
	}

	const isUnique = await context.nonceStore.addIfNotExists(
		context.input.nonce,
		context.nonceTtl,
	);
	return isUnique ? null : "nonce_reused";
}

async function computeExpectedSignature(context: VerifyContext): Promise<string> {
	const bodyHash = await computeHash(context.input.body ?? "", context.algorithm);
	const canonicalString = createCanonicalString({
		method: context.input.method,
		path: context.input.path,
		timestamp: context.input.timestamp,
		nonce: context.input.nonce,
		bodyHash,
	});
	return computeHmac(context.secret, canonicalString, context.algorithm);
}

async function verifyRequest(context: VerifyContext): Promise<VerifyRequestResult> {
	const timestampFailure = validateTimestamp(
		context.input.timestamp,
		context.timestampTolerance,
	);
	if (timestampFailure) {
		return { valid: false, reason: timestampFailure };
	}

	const nonceFailure = await validateNonce(context);
	if (nonceFailure) {
		return { valid: false, reason: nonceFailure };
	}

	const expectedSignature = await computeExpectedSignature(context);
	if (!constantTimeEqual(context.input.signature, expectedSignature)) {
		return { valid: false, reason: "signature_mismatch" };
	}

	return { valid: true };
}

export function createRequestSigner(config: RequestSigningConfig): {
	sign: (input: SignRequestInput) => Promise<SignRequestResult>;
	verify: (
		input: VerifyRequestInput,
		nonceStore?: NonceStore,
	) => Promise<VerifyRequestResult>;
} {
	const algorithm = resolveAlgorithm(config);
	const timestampTolerance = config.timestampToleranceMs ?? DEFAULT_TIMESTAMP_TOLERANCE_MS;
	const nonceTtl = config.nonceTtlMs ?? DEFAULT_NONCE_TTL_MS;
	const requireNonce = config.requireNonce ?? false;

	return {
		sign: async (input: SignRequestInput): Promise<SignRequestResult> =>
			signRequest(input, { config, algorithm }),
		verify: async (
			input: VerifyRequestInput,
			nonceStore?: NonceStore,
		): Promise<VerifyRequestResult> =>
			verifyRequest({
				input,
				nonceStore,
				timestampTolerance,
				nonceTtl,
				requireNonce,
				algorithm,
				secret: config.secret,
			}),
	};
}

/**
 * Generates a cryptographically secure random nonce.
 *
 * @param length - Length of the nonce in bytes (default: 16)
 * @returns Hex-encoded nonce string
 */
export function generateNonce(length = 16): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytesToHex(bytes);
}

/**
 * In-memory nonce store implementation.
 * Suitable for single-server deployments.
 * For distributed systems, use a Redis-based implementation.
 */
export function createInMemoryNonceStore(): NonceStore {
	const nonces = new Map<string, number>();
	let lastCleanup = Date.now();
	const cleanupIntervalMs = 60 * 1000; // Cleanup every minute

	return {
		addIfNotExists: async (nonce: string, ttlMs: number): Promise<boolean> => {
			const now = Date.now();

			// Periodic cleanup
			if (now - lastCleanup > cleanupIntervalMs) {
				for (const [key, expiresAt] of nonces) {
					if (expiresAt <= now) {
						nonces.delete(key);
					}
				}
				lastCleanup = now;
			}

			// Check if nonce exists and is not expired
			const existingExpiry = nonces.get(nonce);
			if (existingExpiry !== undefined && existingExpiry > now) {
				return false;
			}

			// Add nonce with expiry
			nonces.set(nonce, now + ttlMs);
			return true;
		},

		cleanup: async (): Promise<void> => {
			const now = Date.now();
			for (const [key, expiresAt] of nonces) {
				if (expiresAt <= now) {
					nonces.delete(key);
				}
			}
			lastCleanup = now;
		},
	};
}

export type { RequestSigningConfig, SignRequestInput, SignRequestResult };
