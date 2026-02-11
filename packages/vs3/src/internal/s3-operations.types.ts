import type z from "zod";
import type { fileInfoSchema } from "../schemas/file";
import type { S3Encryption } from "../types/encryption";

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

export type MultipartUploadPart = { partNumber: number; eTag: string };
export type PresignedPartResult = {
	partNumber: number;
	presignedUrl: string;
	uploadHeaders?: Record<string, string>;
};

export type PresignUploadPartInput = {
	key: string;
	uploadId: string;
	partNumber: number;
};

export type CompleteMultipartUploadInput = {
	key: string;
	uploadId: string;
	parts: MultipartUploadPart[];
};

export type S3Operations = {
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
	): Promise<PresignedUploadResult>;

	generatePresignedDownloadUrl(
		key: string,
		options?: Partial<{
			expiresIn: number;
			bucket: string;
			encryption: S3Encryption;
		}>,
	): Promise<PresignedDownloadResult>;

	objectExists(
		key: string,
		options?: Partial<{ bucket: string }>,
	): Promise<boolean>;

	deleteObject(
		key: string,
		options?: Partial<{ bucket: string }>,
	): Promise<void>;

	createMultipartUpload(
		key: string,
		options?: Partial<{
			contentType: string;
			acl: ACL;
			metadata: Record<string, string>;
			bucket: string;
			encryption: S3Encryption;
		}>,
	): Promise<{ uploadId: string }>;

	presignUploadPart(
		input: PresignUploadPartInput,
		options?: Partial<{
			expiresIn: number;
			bucket: string;
			encryption: S3Encryption;
		}>,
	): Promise<PresignedUrlResult>;

	completeMultipartUpload(
		input: CompleteMultipartUploadInput,
		options?: Partial<{ bucket: string }>,
	): Promise<void>;

	abortMultipartUpload(
		key: string,
		uploadId: string,
		options?: Partial<{ bucket: string }>,
	): Promise<void>;
};
