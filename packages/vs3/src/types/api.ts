import type { MultipartUploadPart } from "../internal/s3-operations.types";
import type { S3Encryption } from "./encryption";
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

	/**
	 * Generate a presigned download URL
	 * Does not require metadata
	 */
	downloadUrl: APIMethod<
		{ key: string; expiresIn?: number; encryption?: S3Encryption },
		{ presignedUrl: string; downloadHeaders?: Record<string, string> }
	>;

	/**
	 * Create a multipart upload
	 * Requires metadata if metadataSchema is defined
	 */
	multipartCreate: APIMethod<
		WithMetadata<
			{
				fileInfo: FileInfo;
				acl?: "public-read" | "private";
				encryption?: S3Encryption;
			},
			O,
			true
		>,
		{ uploadId: string; key: string }
	>;

	/**
	 * Presign upload URLs for individual parts
	 */
	multipartPresignParts: APIMethod<
		{
			key: string;
			uploadId: string;
			parts: { partNumber: number }[];
			encryption?: S3Encryption;
		},
		{
			parts: {
				partNumber: number;
				presignedUrl: string;
				uploadHeaders?: Record<string, string>;
			}[];
		}
	>;

	/**
	 * Complete a multipart upload by assembling parts
	 */
	multipartComplete: APIMethod<
		{
			key: string;
			uploadId: string;
			parts: MultipartUploadPart[];
		},
		{ key: string }
	>;

	/**
	 * Abort a multipart upload
	 */
	multipartAbort: APIMethod<
		{ key: string; uploadId: string },
		{ success: boolean }
	>;
};
