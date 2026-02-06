import type { FileInfo } from "./file";
import type { StorageOptions } from "./options";
import type { StandardSchemaV1 } from "./standard-schema";
import type { S3Encryption } from "./encryption";

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
 * Storage API with all available endpoints
 * Routes are automatically typed based on whether they require metadata
 */
export type StorageAPI<O extends StorageOptions> = {
	/**
	 * Generate a presigned upload URL
	 * Requires metadata if metadataSchema is defined
	 */
	uploadUrl: APIMethod<
		WithMetadata<
			{
				fileInfo: FileInfo;
				expiresIn?: number;
				acl?: "public-read" | "private";
				encryption?: S3Encryption;
			},
			O,
			true
		>,
		{
			presignedUrl: string;
			key: string;
			uploadHeaders?: Record<string, string>;
		}
	>;
};
