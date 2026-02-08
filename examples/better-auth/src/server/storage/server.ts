import { S3Client } from "@aws-sdk/client-s3";
import { createAdapter, createStorage } from "vs3";
import { betterAuth } from "vs3/middleware/auth";
import { env } from "@/env";
import { auth } from "@/lib/auth";

/**
 * S3 client for fetching files from storage
 */
function createS3Client(): S3Client {
	const host = env.STORAGE_HOST;
	const region = env.STORAGE_REGION;
	const secure = env.STORAGE_SECURE;
	const forcePathStyle = env.STORAGE_FORCE_PATH_STYLE;

	const protocol = secure ? "https" : "http";
	const endpoint = `${protocol}://${host}`;

	return new S3Client({
		region,
		endpoint,
		forcePathStyle,
		credentials: {
			accessKeyId: env.STORAGE_ACCESS_KEY_ID,
			secretAccessKey: env.STORAGE_ACCESS_KEY,
		},
	});
}

// Lazy-initialized S3 client
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
	if (!s3Client) {
		s3Client = createS3Client();
	}
	return s3Client;
}

export const storage = createStorage({
	bucket: env.STORAGE_BUCKET,
	apiPath: "/api/storage",
	adapter: createAdapter({ client: getS3Client() }),
	maxFileSize: 1 * 1024 * 1024,
	middlewares: [betterAuth({ auth })],
});

export const MetadataSchema = storage.$Infer.metadata;

