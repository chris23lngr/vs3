import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	type S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveS3EncryptionConfig } from "../adapters/s3/encryption";
import type { S3Operations } from "./s3-operations.types";

function isNotFoundError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const err = error as Record<string, unknown>;
	if (err.name === "NotFound") return true;
	const metadata = err.$metadata;
	if (
		typeof metadata === "object" &&
		metadata !== null &&
		(metadata as Record<string, unknown>).httpStatusCode === 404
	) {
		return true;
	}
	return false;
}

interface CreateS3OperationsOptions {
	client: S3Client;
	resolveBucket: (bucket?: string) => string;
}

export function createS3Operations(
	options: CreateS3OperationsOptions,
): S3Operations {
	const { client, resolveBucket } = options;

	return {
		async generatePresignedUploadUrl(key, fileInfo, requestOptions) {
			const {
				acl,
				expiresIn = 3600,
				metadata = {},
				contentType,
				bucket,
				encryption,
			} = requestOptions ?? {};

			const resolvedContentType =
				contentType && contentType.trim().length > 0
					? contentType
					: fileInfo.contentType?.trim().length
						? fileInfo.contentType
						: undefined;

			const metadataEntries = Object.entries(metadata ?? {}).filter(
				([, value]) => value !== undefined,
			);

			const encryptionConfig = resolveS3EncryptionConfig(encryption);
			const command = new PutObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
				ContentType: resolvedContentType,
				ACL: acl,
				Metadata: metadataEntries.length
					? Object.fromEntries(metadataEntries)
					: undefined,
				...(encryptionConfig.input ?? {}),
			});

			const url = await getSignedUrl(client, command, { expiresIn });

			if (encryptionConfig.headers) {
				return { url, headers: encryptionConfig.headers };
			}

			return url;
		},

		async generatePresignedDownloadUrl(key, requestOptions) {
			const { expiresIn = 3600, bucket, encryption } = requestOptions ?? {};
			const encryptionConfig =
				encryption?.type === "SSE-C" ? resolveS3EncryptionConfig(encryption) : {};
			const command = new GetObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
				...(encryptionConfig.input ?? {}),
			});
			const url = await getSignedUrl(client, command, { expiresIn });

			if (encryptionConfig.headers) {
				return { url, headers: encryptionConfig.headers };
			}

			return url;
		},

		async objectExists(key, requestOptions) {
			const { bucket } = requestOptions ?? {};
			const command = new HeadObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
			});
			try {
				await client.send(command);
				return true;
			} catch (error) {
				if (isNotFoundError(error)) return false;
				throw error;
			}
		},

		async deleteObject(key, requestOptions) {
			const { bucket } = requestOptions ?? {};
			const command = new DeleteObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
			});
			await client.send(command);
		},

		async createMultipartUpload(key, requestOptions) {
			const {
				acl,
				metadata = {},
				contentType,
				bucket,
				encryption,
			} = requestOptions ?? {};

			const metadataEntries = Object.entries(metadata ?? {}).filter(
				([, value]) => value !== undefined,
			);

			const encryptionConfig = resolveS3EncryptionConfig(encryption);
			const command = new CreateMultipartUploadCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
				ContentType: contentType,
				ACL: acl,
				Metadata: metadataEntries.length
					? Object.fromEntries(metadataEntries)
					: undefined,
				...(encryptionConfig.input ?? {}),
			});

			const response = await client.send(command);

			if (!response.UploadId) {
				throw new Error("S3 did not return an UploadId");
			}

			return { uploadId: response.UploadId };
		},

		async presignUploadPart(input, requestOptions) {
			const { expiresIn = 3600, bucket, encryption } = requestOptions ?? {};
			const encryptionConfig = resolveS3EncryptionConfig(encryption);
			const command = new UploadPartCommand({
				Bucket: resolveBucket(bucket),
				Key: input.key,
				UploadId: input.uploadId,
				PartNumber: input.partNumber,
				...(encryptionConfig.input ?? {}),
			});
			const url = await getSignedUrl(client, command, { expiresIn });

			if (encryptionConfig.headers) {
				return { url, headers: encryptionConfig.headers };
			}

			return url;
		},

		async completeMultipartUpload(input, requestOptions) {
			const { bucket } = requestOptions ?? {};
			const command = new CompleteMultipartUploadCommand({
				Bucket: resolveBucket(bucket),
				Key: input.key,
				UploadId: input.uploadId,
				MultipartUpload: {
					Parts: input.parts.map((part) => ({
						PartNumber: part.partNumber,
						ETag: part.eTag,
					})),
				},
			});
			await client.send(command);
		},

		async abortMultipartUpload(key, uploadId, requestOptions) {
			const { bucket } = requestOptions ?? {};
			const command = new AbortMultipartUploadCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
				UploadId: uploadId,
			});
			await client.send(command);
		},
	};
}
