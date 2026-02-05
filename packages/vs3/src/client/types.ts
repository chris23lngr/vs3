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
};
