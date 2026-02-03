import type { FileInfo } from "./file";
import type { StorageOptions } from "./options";
import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Conditionally adds metadata to a body type based on storage options
 * @param BaseBody - The base body shape
 * @param O - Storage options that may contain a metadataSchema
 * @param RequireMetadata - Whether this route requires metadata (default: true)
 */
export type WithMetadata<
	BaseBody,
	O extends StorageOptions,
	RequireMetadata extends boolean = true,
> = RequireMetadata extends true
	? O["metadataSchema"] extends StandardSchemaV1
		? BaseBody & {
				metadata: StandardSchemaV1.InferInput<NonNullable<O["metadataSchema"]>>;
			}
		: BaseBody
	: BaseBody;

/**
 * Helper to create API method types
 */
type APIMethod<Body, Response> = (context: { body: Body }) => Promise<Response>;

/**
 * Storage API with all endpoints
 * Routes are automatically typed based on whether they require metadata
 */
export type StorageAPI<O extends StorageOptions> = {
	/**
	 * Generate a presigned upload URL
	 * Requires metadata if metadataSchema is defined
	 */
	upload: APIMethod<
		WithMetadata<{ file: File | FileInfo }, O, true>,
		{ uploadUrl: string }
	>;

	/**
	 * Delete a file
	 * Requires metadata if metadataSchema is defined
	 */
	delete: APIMethod<
		WithMetadata<{ key: string }, O, true>,
		{ success: boolean }
	>;

	/**
	 * Generate a presigned download URL
	 * Never requires metadata
	 */
	download: APIMethod<
		WithMetadata<{ key: string }, O, false>,
		{ downloadUrl: string }
	>;
};
