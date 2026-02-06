import type { StandardSchemaV1 } from "../types/standard-schema";

export type StorageClientOptions<
	M extends StandardSchemaV1 = StandardSchemaV1,
> = {
	baseURL?: string;
	apiPath?: string;
	metadataSchema?: M;
	/**
	 * Maximum allowed file size in bytes for client-side validation.
	 * This is an optional pre-flight check that prevents unnecessary network requests.
	 * Must be a positive number. If not specified, no client-side validation is performed.
	 *
	 * **Important:** This should match the server-side `maxFileSize` configuration in StorageOptions
	 * to ensure consistent behavior. The server will always enforce its own limit regardless of
	 * client-side validation.
	 *
	 * @example
	 * ```typescript
	 * // Client and server should have matching limits
	 * const storage = createStorage({
	 *   maxFileSize: 5 * 1024 * 1024, // 5 MB server limit
	 *   // ...
	 * });
	 *
	 * const client = createClient({
	 *   maxFileSize: 5 * 1024 * 1024, // 5 MB client limit (same as server)
	 *   // ...
	 * });
	 * ```
	 */
	maxFileSize?: number;

	/**
	 * Allowed file types for client-side validation.
	 * Supports MIME types (e.g. "image/png" or "image/*") and file extensions (e.g. ".png", ".jpg").
	 * When provided, the client validates MIME type, extension, and magic bytes (when available)
	 * before requesting an upload URL.
	 *
	 * **Magic byte detection** is supported for the following formats:
	 * - PNG (image/png)
	 * - JPEG (image/jpeg)
	 * - GIF (image/gif)
	 * - WebP (image/webp)
	 * - PDF (application/pdf)
	 *
	 * For other formats, only MIME type and extension validation is performed.
	 *
	 * **Note:** Extensions "jpeg" and "jpg" are treated as equivalent.
	 *
	 * **Important:** This should match the server-side `allowedFileTypes` configuration in StorageOptions
	 * to ensure consistent behavior. The server will always enforce its own rules regardless of
	 * client-side validation.
	 *
	 * @example
	 * ```typescript
	 * allowedFileTypes: ["image/png", "image/jpeg", ".pdf"],
	 * ```
	 */
	allowedFileTypes?: string[];

	/**
	 * Whether to throw an error if hook operation fails.
	 *
	 * When set to true, hooks will rethrow occurred errors instead of returning them as part of the state.
	 */
	throwOnError?: boolean;
};
