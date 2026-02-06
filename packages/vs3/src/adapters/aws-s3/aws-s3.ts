import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Adapter } from "../../types/adapter";
import { resolveS3EncryptionConfig } from "../s3/encryption";

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

interface CreateAwsS3AdapterOptions {
	client: S3Client;
	bucket?: string;
}

export function createAwsS3Adapter(
	options: CreateAwsS3AdapterOptions,
): Adapter {
	const resolveBucket = (bucket?: string) => {
		const resolved = bucket ?? options.bucket;
		if (!resolved) {
			throw new Error(
				"AWS S3 adapter requires a bucket. Provide it when creating the adapter or in the request options.",
			);
		}
		return resolved;
	};

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

			const url = await getSignedUrl(options.client, command, { expiresIn });

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
			const url = await getSignedUrl(options.client, command, { expiresIn });

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
				await options.client.send(command);
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
			await options.client.send(command);
		},
	};
}
