import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type { VerificationFailureReason } from "../../types/security";
import type { VerificationFailureContext } from "./types";

const VERIFICATION_ERROR_MAP: Record<
	VerificationFailureReason,
	{ code: StorageErrorCode; message: string }
> = {
	signature_mismatch: {
		code: StorageErrorCode.SIGNATURE_INVALID,
		message:
			"Request signature verification failed. The signature does not match.",
	},
	timestamp_expired: {
		code: StorageErrorCode.TIMESTAMP_EXPIRED,
		message:
			"Request timestamp has expired. The request is too old or from the future.",
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
		message:
			"Request nonce has already been used. Each request must have a unique nonce.",
	},
};

function createVerificationError(
	code: StorageErrorCode,
	message: string,
	details?: unknown,
): StorageServerError {
	return new StorageServerError({ code, message, details });
}

export function throwVerificationFailure(
	context: VerificationFailureContext,
): never {
	const fallback = createVerificationError(
		context.code,
		context.message,
		context.details,
	);
	if (!context.onVerificationFailure) {
		throw fallback;
	}

	const response = context.onVerificationFailure(
		context.reason,
		context.request,
	);
	if (response instanceof Response) {
		throw response;
	}

	throw fallback;
}

export function handleVerificationFailure(
	reason: VerificationFailureReason,
	context: VerificationFailureContext,
): never {
	const errorInfo = VERIFICATION_ERROR_MAP[reason];
	throwVerificationFailure({
		...context,
		reason,
		code: errorInfo.code,
		message: errorInfo.message,
		details: { reason },
	});
}
