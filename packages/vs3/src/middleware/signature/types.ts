import type { StorageErrorCode } from "../../core/error/codes";
import type { createRequestSigner } from "../../core/security/request-signer";
import type { NonceStore, RequestSigningConfig } from "../../types/security";

/**
 * Configuration for the signature verification middleware.
 */
export type VerifySignatureMiddlewareConfig = RequestSigningConfig & {
	/**
	 * Optional nonce store for replay attack prevention.
	 * If not provided and requireNonce is true, an in-memory store will be used.
	 */
	nonceStore?: NonceStore;

	/**
	 * Skip signature verification for certain paths.
	 * Useful for health checks or public endpoints.
	 */
	skipPaths?: string[];

	/**
	 * Custom error handler for verification failures.
	 * If not provided, a StorageServerError will be thrown.
	 */
	onVerificationFailure?: (reason: string, request: Request) => Response | never;
};

/**
 * Result of verification containing extracted signature info.
 */
export type VerificationResult = {
	verified: true;
	timestamp: number;
	nonce?: string;
};

export type SignatureData = {
	signature: string;
	timestamp: number;
	nonce?: string;
};

export type VerificationContext = {
	request: Request;
	config: VerifySignatureMiddlewareConfig;
	signer: ReturnType<typeof createRequestSigner>;
	nonceStore?: NonceStore;
};

export type HeaderValidationContext = {
	request: Request;
	config: VerifySignatureMiddlewareConfig;
};

export type VerificationFailureContext = {
	reason: string;
	code: StorageErrorCode;
	message: string;
	details?: unknown;
	request: Request;
	onVerificationFailure?: (reason: string, request: Request) => Response | never;
};
