import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Adapter } from "../../types/adapter";

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

			const command = new PutObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
				ContentType: resolvedContentType,
				ACL: acl,
				Metadata: metadataEntries.length
					? Object.fromEntries(metadataEntries)
					: undefined,
			});

			return getSignedUrl(options.client, command, { expiresIn });
		},
		async generatePresignedDownloadUrl(key, requestOptions) {
			const { expiresIn = 3600, bucket } = requestOptions ?? {};
			const command = new GetObjectCommand({
				Bucket: resolveBucket(bucket),
				Key: key,
			});
			return getSignedUrl(options.client, command, { expiresIn });
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
