import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { throwVerificationFailure } from "./errors";
import type { HeaderValidationContext, SignatureData } from "./types";

function getHeader(headers: Headers, name: string): string | undefined {
	return headers.get(name) ?? undefined;
}

export async function readRequestBody(request: Request): Promise<string> {
	try {
		const clone = request.clone();
		return await clone.text();
	} catch {
		throw new StorageServerError({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Failed to read request body for signature verification.",
			details: undefined,
		});
	}
}

export function extractPath(request: Request): string {
	try {
		const url = new URL(request.url);
		return url.pathname;
	} catch {
		throw new StorageServerError({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Failed to parse request URL for signature verification.",
			details: undefined,
		});
	}
}

function parseTimestamp(timestampStr: string): number | null {
	if (!/^\d+$/.test(timestampStr)) {
		return null;
	}

	const value = Number(timestampStr);
	return Number.isFinite(value) ? value : null;
}

function getRequiredHeader(
	name: string,
	context: HeaderValidationContext,
): string {
	const value = getHeader(context.request.headers, name);
	if (value) {
		return value;
	}

	const reason =
		name === "x-signature" ? "signature_missing" : "timestamp_missing";
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
		message:
			"Request timestamp is invalid. Must be a valid Unix timestamp in milliseconds.",
		details: { header: "x-timestamp", value: timestampStr },
		request: context.request,
		onVerificationFailure: context.config.onVerificationFailure,
	});
}

function validateNonceRequirement(
	context: HeaderValidationContext,
	nonce?: string,
): void {
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

export function extractSignatureData(
	context: HeaderValidationContext,
): SignatureData {
	const signature = getRequiredHeader("x-signature", context);
	const timestamp = parseTimestampHeader(context);
	const nonce = getHeader(context.request.headers, "x-nonce");
	validateNonceRequirement(context, nonce);
	return { signature, timestamp, nonce };
}
