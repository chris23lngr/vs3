import type z from "zod";
import type { fileInfoSchema } from "../schemas/file";

export type ACL =
	| "public-read"
	| "private"
	| "authenticated-read"
	| "bucket-owner-full-control"
	| "bucket-owner-read";

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
		}>,
	): string | Promise<string>;

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
		}>,
	): string | Promise<string>;

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
