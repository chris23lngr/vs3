import {
	createInMemoryNonceStore,
	createRequestSigner,
} from "../../core/security/request-signer";
import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";
import type { VerificationResult, VerifySignatureMiddlewareConfig } from "./types";
import { verifySignedRequest } from "./verify-request";

type SignatureMiddlewareResult = {
	signature: VerificationResult;
};

/**
 * Creates a signature verification middleware that integrates with the
 * middleware chain system. Returns a StorageMiddleware that adds
 * `{ signature: VerificationResult }` to the accumulated context.
 */
export function createVerifySignatureMiddleware(
	config: VerifySignatureMiddlewareConfig,
): StorageMiddleware<object, SignatureMiddlewareResult> {
	const signer = createRequestSigner(config);
	const nonceStore =
		config.requireNonce && !config.nonceStore
			? createInMemoryNonceStore()
			: config.nonceStore;

	return createStorageMiddleware(
		{
			name: "verify-signature",
			skipPaths: config.skipPaths,
		},
		async (ctx) => {
			const result = await verifySignedRequest({
				request: ctx.request,
				config,
				signer,
				nonceStore,
			});
			return { signature: result };
		},
	);
}
