import { StorageErrorCode } from "../../core/error/codes";
import { handleVerificationFailure } from "./errors";
import {
	extractPath,
	extractSignatureData,
	readRequestBody,
} from "./extract-signature";
import type {
	HeaderValidationContext,
	SignatureData,
	VerificationContext,
	VerificationResult,
} from "./types";

async function verifySignature(
	context: VerificationContext,
): Promise<SignatureData> {
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

function buildVerificationResult(
	signatureData: SignatureData,
): VerificationResult {
	return {
		verified: true,
		timestamp: signatureData.timestamp,
		nonce: signatureData.nonce,
	};
}

export async function verifySignedRequest(
	context: VerificationContext,
): Promise<VerificationResult> {
	const signatureData = await verifySignature(context);
	return buildVerificationResult(signatureData);
}
