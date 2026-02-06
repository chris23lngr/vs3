import type { StorageMiddleware } from "../middleware";
import type { Adapter } from "./adapter";
import type { FileInfo } from "./file";
import type { BeforeHookResult } from "./hooks";
import type { StandardSchemaV1 } from "./standard-schema";
import type { ContentValidatorInput } from "./validation";

export type StorageOptions<M extends StandardSchemaV1 = StandardSchemaV1> = {
	bucket: string;

	adapter: Adapter;

	/**
	 * Maximum allowed file size in bytes.
	 * Files exceeding this limit will be rejected with a FILE_TOO_LARGE error.
	 * Must be a positive number. If not specified, no size limit is enforced.
	 *
	 * @example
	 * ```typescript
	 * maxFileSize: 5 * 1024 * 1024, // 5 MB
	 * ```
	 */
	maxFileSize?: number;

	/**
	 * Allowed file types for uploads.
	 * Supports MIME types (e.g. "image/png" or "image/*") and file extensions (e.g. ".png", ".jpg").
	 * When provided, uploads that do not match are rejected with FILE_TYPE_NOT_ALLOWED.
	 *
	 * **Note:** Extensions "jpeg" and "jpg" are treated as equivalent.
	 *
	 * @example
	 * ```typescript
	 * allowedFileTypes: ["image/png", "image/jpeg", ".pdf"],
	 * ```
	 */
	allowedFileTypes?: string[];

	/**
	 * Custom content validators for uploads.
	 * Validators are run sequentially after built-in validations (size, file type).
	 * If any validator fails, the upload is rejected with a CONTENT_VALIDATION_ERROR.
	 *
	 * Validators can be synchronous or asynchronous functions. Each validator
	 * receives the file info and parsed metadata, and must return a validation result.
	 *
	 * @example
	 * ```typescript
	 * contentValidators: [
	 *   // Simple function validator
	 *   (ctx) => {
	 *     if (ctx.fileInfo.name.includes("temp")) {
	 *       return { valid: false, reason: "Temporary files not allowed" };
	 *     }
	 *     return { valid: true };
	 *   },
	 *
	 *   // Named validator for better error messages
	 *   {
	 *     name: "quota-check",
	 *     validate: async (ctx) => {
	 *       const usage = await getUserUsage(ctx.metadata.userId);
	 *       if (usage + ctx.fileInfo.size > MAX_QUOTA) {
	 *         return { valid: false, reason: "Storage quota exceeded" };
	 *       }
	 *       return { valid: true };
	 *     },
	 *   },
	 *
	 *   // Using built-in validator factories
	 *   createMaxSizeValidator(10 * 1024 * 1024),
	 *   createContentTypeValidator(["image/*"]),
	 * ],
	 * ```
	 */
	contentValidators?: ContentValidatorInput<StandardSchemaV1.InferOutput<M>>[];

	/**
	 * Timeout in milliseconds for each content validator.
	 * If a validator takes longer than this, the upload is rejected.
	 * Default: no timeout.
	 *
	 * @example
	 * ```typescript
	 * contentValidatorTimeoutMs: 5000, // 5 seconds
	 * ```
	 */
	contentValidatorTimeoutMs?: number;

	metadataSchema?: M;

	baseUrl?: string;

	apiPath?: string;

	/**
	 * Middlewares to apply to the storage API.
	 * Middlewares are applied to every request to the storage API (e.g. `api.uploadUrl()`).
	 * Middlewares are applied in the order they are provided.
	 *
	 * @example
	 * ```typescript
	 * middlewares: [createVerifySignatureMiddleware({ secret: "..." })],
	 * ```
	 */
	middlewares?: readonly StorageMiddleware[];

	generateKey?: (
		fileInfo: FileInfo,
		metadata: StandardSchemaV1.InferInput<M>,
	) => string | Promise<string>;

	hooks?: {
		beforeUpload?: (
			fileInfo: FileInfo,
			metadata: StandardSchemaV1.InferOutput<M>,
		) => BeforeHookResult | Promise<BeforeHookResult>;

		afterUpload?: (
			fileInfo: FileInfo,
			metadata: StandardSchemaV1.InferOutput<M>,
			key: string,
		) => void | Promise<void>;
	};
};
