import { S3Client } from "@aws-sdk/client-s3";
import { createAdapter, createStorage } from "vs3";
import { z } from "zod";

export interface Env {
	STORAGE_BUCKET: string;
	STORAGE_REGION: string;
	STORAGE_ACCESS_KEY_ID: string;
	STORAGE_ACCESS_KEY: string;
	STORAGE_ENDPOINT?: string;
}

export function createStorageFromEnv(env: Env) {
	const client = new S3Client({
		region: env.STORAGE_REGION,
		endpoint: env.STORAGE_ENDPOINT,
		credentials: {
			accessKeyId: env.STORAGE_ACCESS_KEY_ID,
			secretAccessKey: env.STORAGE_ACCESS_KEY,
		},
	});

	return createStorage({
		bucket: env.STORAGE_BUCKET,
		apiPath: "/api/storage",
		adapter: createAdapter({ client }),
		metadataSchema: z.object({ userId: z.string() }),
		maxFileSize: 5 * 1024 * 1024,
	});
}
