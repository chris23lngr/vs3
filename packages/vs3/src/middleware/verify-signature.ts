import { StorageErrorCode } from "../core/error/codes";
import { StorageServerError } from "../core/error/error";
import {
	createInMemoryNonceStore,
	createRequestSigner,
} from "../core/security/request-signer";
import type {
	AuthHook,
	AuthHookResult,
	NonceStore,
	RequestSigningConfig,
	SignatureHeaders,
	VerificationFailureReason,
} from "../types/security";

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
	 * Optional auth hook for additional token validation.
	 * Called after signature verification succeeds.
	 */
	authHook?: AuthHook;

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

type VerificationFailureContext = {
	reason: string;
	code: StorageErrorCode;
	message: string;
	details?: unknown;
	request: Request;
	onVerificationFailure?: (reason: string, request: Request) => Response | never;
};

type HeaderValidationContext = {
	request: Request;
	config: VerifySignatureMiddlewareConfig;
};

type SignatureData = {
	signature: string;
	timestamp: number;
	nonce?: string;
};

type VerificationContext = {
	request: Request;
	config: VerifySignatureMiddlewareConfig;
	signer: ReturnType<typeof createRequestSigner>;
	nonceStore?: NonceStore;
};

const VERIFICATION_ERROR_MAP: Record<
	VerificationFailureReason,
	{ code: StorageErrorCode; message: string }
> = {
	signature_mismatch: {
		code: StorageErrorCode.SIGNATURE_INVALID,
		message: "Request signature verification failed. The signature does not match.",
	},
	timestamp_expired: {
		code: StorageErrorCode.TIMESTAMP_EXPIRED,
		message: "Request timestamp has expired. The request is too old or from the future.",
	},
	timestamp_invalid: {
		code: StorageErrorCode.TIMESTAMP_MISSING,
		message: "Request timestamp is invalid.",
	},
	nonce_missing: {
		code: StorageErrorCode.NONCE_MISSING,
		message: "Request nonce is required but missing.",
	},
	nonce_store_missing: {
		code: StorageErrorCode.NONCE_STORE_MISSING,
		message: "Nonce validation is required but no nonce store is configured.",
	},
	nonce_reused: {
		code: StorageErrorCode.NONCE_REUSED,
		message: "Request nonce has already been used. Each request must have a unique nonce.",
	},
};

/**
 * Extracts a header value from a Request or Headers object.
 */
function getHeader(headers: Headers, name: string): string | undefined {
	return headers.get(name) ?? undefined;
}

/**
 * Reads the request body as text.
 * Handles cases where body might have already been read.
 */
async function readRequestBody(request: Request): Promise<string> {
	try {
		const clone = request.clone();
		return await clone.text();
	} catch {
		return "";
	}
}

/**
 * Extracts the path from a request URL.
 */
function extractPath(request: Request): string {
	try {
		const url = new URL(request.url);
		return url.pathname;
	} catch {
		return request.url;
	}
}

/**
 * Creates a verification failure response.
 */
function createVerificationError(
	code: StorageErrorCode,
	message: string,
	details?: unknown,
): StorageServerError {
	return new StorageServerError({
		code,
		message,
		details,
	});
}

function throwVerificationFailure(context: VerificationFailureContext): never {
	const fallback = createVerificationError(context.code, context.message, context.details);
	if (!context.onVerificationFailure) {
		throw fallback;
	}

	const response = context.onVerificationFailure(context.reason, context.request);
	if (response instanceof Response) {
		throw response;
	}

	throw fallback;
}

function parseTimestamp(timestampStr: string): number | null {
	if (!/^\d+$/.test(timestampStr)) {
		return null;
	}

	const value = Number(timestampStr);
	return Number.isFinite(value) ? value : null;
}

function headersToRecord(headers: SignatureHeaders): Record<string, string> {
	const record: Record<string, string> = {
		"x-signature": headers["x-signature"],
		"x-timestamp": headers["x-timestamp"],
	};
	if (headers["x-nonce"]) {
		record["x-nonce"] = headers["x-nonce"];
	}
	return record;
}

function getRequiredHeader(name: string, context: HeaderValidationContext): string {
	const value = getHeader(context.request.headers, name);
	if (value) {
		return value;
	}

	const reason = name === "x-signature" ? "signature_missing" : "timestamp_missing";
	const code =
		name === "x-signature"
			? StorageErrorCode.SIGNATURE_MISSING
			: StorageErrorCode.TIMESTAMP_MISSING;
	const message =
		name === "x-signature"
			? "Request signature is missing. Include the 'x-signature' header."
			: "Request timestamp is missing. Include the 'x-timestamp' header.";
	throwVerificationFailure({
		reason,
		code,
		message,
		details: { header: name },
		request: context.request,
		onVerificationFailure: context.config.onVerificationFailure,
	});
}

function parseTimestampHeader(context: HeaderValidationContext): number {
	const timestampStr = getRequiredHeader("x-timestamp", context);
	const timestamp = parseTimestamp(timestampStr);
	if (timestamp !== null) {
		return timestamp;
	}

	throwVerificationFailure({
		reason: "timestamp_invalid",
		code: StorageErrorCode.TIMESTAMP_MISSING,
		message: "Request timestamp is invalid. Must be a valid Unix timestamp in milliseconds.",
		details: { header: "x-timestamp", value: timestampStr },
		request: context.request,
		onVerificationFailure: context.config.onVerificationFailure,
	});
}

function validateNonceRequirement(context: HeaderValidationContext, nonce?: string): void {
	if (!context.config.requireNonce || nonce) {
		return;
	}

	throwVerificationFailure({
		reason: "nonce_missing",
		code: StorageErrorCode.NONCE_MISSING,
		message: "Request nonce is missing. Include the 'x-nonce' header.",
		details: { header: "x-nonce" },
		request: context.request,
		onVerificationFailure: context.config.onVerificationFailure,
	});
}

function extractSignatureData(context: HeaderValidationContext): SignatureData {
	const signature = getRequiredHeader("x-signature", context);
	const timestamp = parseTimestampHeader(context);
	const nonce = getHeader(context.request.headers, "x-nonce");
	validateNonceRequirement(context, nonce);
	return { signature, timestamp, nonce };
}

function handleVerificationFailure(
	reason: VerificationFailureReason,
	context: VerificationFailureContext,
): never {
	const errorInfo = VERIFICATION_ERROR_MAP[reason];
	if (errorInfo) {
		throwVerificationFailure({
			...context,
			reason,
			code: errorInfo.code,
			message: errorInfo.message,
			details: { reason },
		});
	}

	throwVerificationFailure({
		...context,
		reason,
		code: StorageErrorCode.SIGNATURE_INVALID,
		message: "Request signature verification failed.",
		details: { reason },
	});
}

async function runAuthHook(
	request: Request,
	authHook?: AuthHook,
	onVerificationFailure?: (reason: string, request: Request) => Response | never,
): Promise<AuthHookResult | undefined> {
	if (!authHook) {
		return undefined;
	}

	const headers: Record<string, string | undefined> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});

	const authResult = await authHook({ request, headers });
	if (authResult.authenticated) {
		return authResult;
	}

	throwVerificationFailure({
		reason: "auth_failed",
		code: StorageErrorCode.UNAUTHORIZED,
		message: authResult.reason ?? "Authentication failed.",
		details: { authHookFailed: true },
		request,
		onVerificationFailure,
	});
}

async function verifySignature(context: VerificationContext): Promise<SignatureData> {
	const path = extractPath(context.request);
	const headerContext: HeaderValidationContext = {
		request: context.request,
		config: context.config,
	};
	const signatureData = extractSignatureData(headerContext);
	const body = await readRequestBody(context.request);
	const verificationResult = await context.signer.verify(
		{
			method: context.request.method,
			path,
			body,
			signature: signatureData.signature,
			timestamp: signatureData.timestamp,
			nonce: signatureData.nonce,
		},
		context.nonceStore,
	);

	if (!verificationResult.valid) {
		handleVerificationFailure(verificationResult.reason, {
			reason: verificationResult.reason,
			code: StorageErrorCode.SIGNATURE_INVALID,
			message: "Request signature verification failed.",
			request: context.request,
			onVerificationFailure: context.config.onVerificationFailure,
		});
	}

	return signatureData;
}

type VerificationResponseInput = {
	signatureData: SignatureData;
	authResult?: AuthHookResult;
};

function buildVerificationResult(input: VerificationResponseInput): VerificationResult {
	return {
		verified: true,
		timestamp: input.signatureData.timestamp,
		nonce: input.signatureData.nonce,
		auth: input.authResult?.authenticated
			? {
					userId: input.authResult.userId,
					metadata: input.authResult.metadata,
				}
			: undefined,
	};
}

async function verifySignedRequest(context: VerificationContext): Promise<VerificationResult> {
	const signatureData = await verifySignature(context);
	const authResult = await runAuthHook(
		context.request,
		context.config.authHook,
		context.config.onVerificationFailure,
	);
	return buildVerificationResult({ signatureData, authResult });
}

/**
 * Result of verification containing extracted auth info.
 */
export type VerificationResult = {
	verified: true;
	timestamp: number;
	nonce?: string;
	auth?: {
		userId?: string;
		metadata?: Record<string, unknown>;
	};
};

/**
 * Creates a signature verification middleware function.
 *
 * @example
 * ```typescript
 * const verifySignature = createVerifySignatureMiddleware({
 *   secret: process.env.SIGNING_SECRET,
 *   timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
 *   requireNonce: true,
 * });
 *
 * // In your request handler
 * async function handler(request: Request) {
 *   const result = await verifySignature(request);
 *   // Request is verified, proceed with handling
 * }
 * ```
 */
export function createVerifySignatureMiddleware(
	config: VerifySignatureMiddlewareConfig,
): (request: Request) => Promise<VerificationResult> {
	const signer = createRequestSigner(config);
	const nonceStore =
		config.requireNonce && !config.nonceStore
			? createInMemoryNonceStore()
			: config.nonceStore;
	const skipPaths = new Set(config.skipPaths ?? []);

	return async (request: Request): Promise<VerificationResult> => {
		const path = extractPath(request);
		if (skipPaths.has(path)) {
			return { verified: true, timestamp: Date.now() };
		}

		return verifySignedRequest({
			request,
			config,
			signer,
			nonceStore,
		});
	};
}

/**
 * Creates a client-side request signer that can be used to sign outgoing requests.
 *
 * @example
 * ```typescript
 * const signRequest = createClientRequestSigner({
 *   secret: "shared-secret",
 * });
 *
 * // Sign a request before sending
 * const { headers } = await signRequest({
 *   method: "POST",
 *   path: "/api/storage/upload-url",
 *   body: JSON.stringify({ fileInfo: { ... } }),
 * });
 *
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
export function createClientRequestSigner(config: RequestSigningConfig): {
	sign: (input: {
		method: string;
		path: string;
		body?: string;
		nonce?: string;
	}) => Promise<{
		headers: Record<string, string>;
		timestamp: number;
		signature: string;
	}>;
} {
	const signer = createRequestSigner(config);

	return {
		sign: async (input) => {
			const result = await signer.sign({
				method: input.method,
				path: input.path,
				body: input.body,
				nonce: input.nonce,
			});

			return {
				headers: headersToRecord(result.headers),
				timestamp: result.timestamp,
				signature: result.signature,
			};
		},
	};
}

export type { VerifySignatureMiddlewareConfig };
