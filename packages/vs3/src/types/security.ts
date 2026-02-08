/**
 * Configuration options for request signing and verification.
 */
export type RequestSigningConfig = {
	/**
	 * Secret key used for HMAC signature generation and verification.
	 * Must be a sufficiently long and random string (recommended: 32+ characters).
	 */
	secret: string;

	/**
	 * HMAC algorithm to use for signature generation.
	 * @default "SHA-256"
	 */
	algorithm?: "SHA-256" | "SHA-384" | "SHA-512";

	/**
	 * Maximum allowed age of a request in milliseconds.
	 * Requests with timestamps older than this will be rejected.
	 * @default 300000 (5 minutes)
	 */
	timestampToleranceMs?: number;

	/**
	 * Whether to require and validate nonces for replay attack prevention.
	 * When enabled, each request must include a unique nonce that hasn't been used before.
	 * @default false
	 */
	requireNonce?: boolean;

	/**
	 * Time-to-live for nonces in milliseconds.
	 * Nonces older than this will be purged from the store.
	 * Should be at least as long as timestampToleranceMs.
	 * @default 600000 (10 minutes)
	 */
	nonceTtlMs?: number;
};

/**
 * Headers used for request signing.
 */
export type SignatureHeaders = {
	/** HMAC signature of the request */
	"x-signature": string;
	/** Unix timestamp in milliseconds when the request was signed */
	"x-timestamp": string;
	/** Optional unique identifier for replay attack prevention */
	"x-nonce"?: string;
};

/**
 * Input for creating a signed request.
 */
export type SignRequestInput = {
	/** HTTP method (GET, POST, etc.) */
	method: string;
	/** Request path (e.g., "/upload-url") */
	path: string;
	/** Request body as a string (JSON stringified) */
	body?: string;
	/** Optional nonce for replay protection */
	nonce?: string;
	/** Optional timestamp override (defaults to current time) */
	timestamp?: number;
};

/**
 * Result of signing a request.
 */
export type SignRequestResult = {
	/** The computed HMAC signature (hex-encoded) */
	signature: string;
	/** The timestamp used for signing (Unix milliseconds) */
	timestamp: number;
	/** The nonce if provided */
	nonce?: string;
	/** Headers to include with the request */
	headers: SignatureHeaders;
};

/**
 * Input for verifying a signed request.
 */
export type VerifyRequestInput = {
	/** HTTP method (GET, POST, etc.) */
	method: string;
	/** Request path (e.g., "/upload-url") */
	path: string;
	/** Request body as a string (JSON stringified) */
	body?: string;
	/** Signature from the request header */
	signature: string;
	/** Timestamp from the request header */
	timestamp: number;
	/** Optional nonce from the request header */
	nonce?: string;
};

/**
 * Result of signature verification.
 */
export type VerifyRequestResult =
	| { valid: true }
	| { valid: false; reason: VerificationFailureReason };

/**
 * Reasons why signature verification might fail.
 */
export type VerificationFailureReason =
	| "signature_mismatch"
	| "timestamp_expired"
	| "timestamp_invalid"
	| "nonce_missing"
	| "nonce_store_missing"
	| "nonce_reused";

/**
 * Interface for nonce stores.
 * Implementations must be thread-safe for concurrent access.
 */
export type NonceStore = {
	/**
	 * Check if a nonce exists and mark it as used if not.
	 * Returns true if the nonce was successfully added (not a duplicate).
	 * Returns false if the nonce already exists (duplicate/replay).
	 */
	addIfNotExists: (nonce: string, ttlMs: number) => Promise<boolean>;

	/**
	 * Clean up expired nonces.
	 * Called periodically to prevent memory leaks.
	 */
	cleanup?: () => Promise<void>;
};
