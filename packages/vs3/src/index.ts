export { aws } from "./adapters";
export { toNextJsRouteHandler } from "./integrations/next-js";
export { createStorage } from "./storage/create-storage";
export type { Adapter } from "./types/adapter";
export type { StorageOptions } from "./types/options";
export type { Storage } from "./types/storage";

// Content validation exports
export {
	combineValidators,
	createContentTypeValidator,
	createExtensionValidator,
	createFilenamePatternValidator,
	createMaxSizeValidator,
	createMinSizeValidator,
	createValidator,
	runContentValidators,
} from "./core/validation";

export type {
	ContentValidationContext,
	ContentValidationResult,
	ContentValidationRunResult,
	ContentValidator,
	ContentValidatorInput,
	NamedContentValidator,
	RunContentValidatorsOptions,
} from "./types/validation";

// Security exports - Request signing and verification
export {
	createRequestSigner,
	generateNonce,
	createInMemoryNonceStore,
} from "./core/security";

export {
	createVerifySignatureMiddleware,
	createClientRequestSigner,
} from "./middleware";

export type {
	RequestSigningConfig,
	SignRequestInput,
	SignRequestResult,
	SignatureHeaders,
	VerifyRequestInput,
	VerifyRequestResult,
	VerificationFailureReason,
	NonceStore,
	AuthHook,
	AuthHookContext,
	AuthHookResult,
} from "./types/security";

export type {
	VerifySignatureMiddlewareConfig,
	VerificationResult,
} from "./middleware";
