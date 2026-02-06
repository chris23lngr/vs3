import type z from "zod";
import type { fileInfoSchema } from "../schemas/file";
import type { S3Encryption } from "./encryption";

export type ACL =
	| "public-read"
	| "private"
	| "authenticated-read"
	| "bucket-owner-full-control"
	| "bucket-owner-read";

export type PresignedUrlResult =
	| string
	| { url: string; headers?: Record<string, string> };

export type PresignedUploadResult = PresignedUrlResult;
export type PresignedDownloadResult = PresignedUrlResult;

export type Adapter = {
	/**
	 * Generated a presigned upload url for a given key.
	 *
	 * @throws {StorageServerError} If the adapter fails to generate a presigned upload url.
	 */
	generatePresignedUploadUrl(
		key: string,
		fileInfo: z.infer<typeof fileInfoSchema>,
		options?: Partial<{
			expiresIn: number;
			contentType: string;
			acl: ACL;
			metadata: Record<string, string>;
			bucket: string;
			encryption: S3Encryption;
		}>,
	): PresignedUploadResult | Promise<PresignedUploadResult>;

	/**
	 * Generate a presigned download url for a given key.
	 *
	 * @param key - The key to generate a presigned download url for.
	 * @param options - The options for the presigned download url.
	 */
	generatePresignedDownloadUrl(
		key: string,
		options?: Partial<{
			expiresIn: number;
			bucket: string;
			encryption: S3Encryption;
		}>,
	): PresignedDownloadResult | Promise<PresignedDownloadResult>;

	/**
	 * Delete an object by key.
	 */
	deleteObject(
		key: string,
		options?: Partial<{
			bucket: string;
		}>,
	): void | Promise<void>;
};
