import { StorageErrorCode } from "../../core/error/codes";
import type { AuthHookResult } from "../../types/security";
import { runAuthHook } from "./auth-hook";
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

type VerificationResponseInput = {
	signatureData: SignatureData;
	authResult?: AuthHookResult;
};

function buildVerificationResult(
	input: VerificationResponseInput,
): VerificationResult {
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

export async function verifySignedRequest(
	context: VerificationContext,
): Promise<VerificationResult> {
	const signatureData = await verifySignature(context);
	const authResult = await runAuthHook(
		context.request,
		context.config.authHook,
		context.config.onVerificationFailure,
	);
	return buildVerificationResult({ signatureData, authResult });
}
