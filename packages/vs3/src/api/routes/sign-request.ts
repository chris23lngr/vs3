import z from "zod";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { generateNonce } from "../../core/security/request-signer";
import { runAuthHook } from "../../middleware/signature/auth-hook";
import { createServerRequestSigner } from "../../middleware/signature/server-signer";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { routeRegistry } from "../registry";

type SignRequestResponse = {
	headers: Record<string, string>;
};

function buildFallbackUrl(baseUrl: string, apiPath: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const normalizedApi =
		apiPath && !apiPath.startsWith("/") ? `/${apiPath}` : apiPath;
	return `${normalizedBase}${normalizedApi}/sign-request`;
}

function resolveAuthRequest(ctx: {
	request?: Request | undefined;
	headers?: Headers | undefined;
	context: {
		$options: { baseUrl?: string; apiPath?: string };
	};
}): Request {
	if (ctx.request instanceof Request) {
		return ctx.request;
	}

	const { baseUrl, apiPath } = ctx.context.$options;
	if (!baseUrl) {
		throw new StorageServerError({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Cannot resolve auth request.",
			details:
				"No Request object was provided and baseUrl is not configured. " +
				"Either pass a real Request to the endpoint or set baseUrl in createStorage().",
		});
	}

	return new Request(buildFallbackUrl(baseUrl, apiPath ?? ""), {
		method: "POST",
		headers: ctx.headers,
	});
}

export function createSignRequestRoute() {
	const schemas = routeRegistry["/sign-request"];

	return createStorageEndpoint(
		"/sign-request",
		{
			method: "POST",
			metadataSchema: z.undefined(),
			requireMetadata: schemas.requireMetadata,
			body: schemas.body,
			outputSchema: schemas.output,
		},
		async (ctx): Promise<SignRequestResponse> => {
			if (
				ctx.context === null ||
				ctx.context === undefined ||
				ctx.context.$options === null ||
				ctx.context.$options === undefined
			) {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "Storage context is not available.",
					details:
						"Storage context or $options is missing. The endpoint was called without proper context injection. " +
						"Ensure you are using createStorage() and calling endpoints through the returned API, " +
						"not calling raw endpoint handlers directly.",
				});
			}

			const signatureConfig = ctx.context.$options.signature;
			if (!signatureConfig) {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "Signature configuration is not available.",
					details:
						"Provide signature options on createStorage({ signature: { ... } }) to enable /sign-request.",
				});
			}

			// Runtime invariant: SignRequestConfig requires authHook at the type level,
			// but this guard protects against plain-JS callers that bypass TypeScript.
			if (!signatureConfig.authHook) {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "An authHook is required for the /sign-request route.",
					details:
						"Provide an authHook in createStorage({ signature: { authHook: ... } }) " +
						"to authenticate callers before issuing signatures.",
				});
			}

			const authRequest = resolveAuthRequest(ctx);
			await runAuthHook(
				authRequest,
				signatureConfig.authHook,
				signatureConfig.onVerificationFailure,
			);

			const signer = createServerRequestSigner(signatureConfig);
			const nonce = signatureConfig.requireNonce ? generateNonce() : undefined;

			const { headers } = await signer.sign({
				method: ctx.body.method,
				path: ctx.body.path,
				body: ctx.body.body,
				nonce,
			});

			return {
				headers,
			};
		},
	);
}
