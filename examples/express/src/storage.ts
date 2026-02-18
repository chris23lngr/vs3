import { S3Client } from "@aws-sdk/client-s3";
import { createAdapter, createStorage } from "vs3";
import { z } from "zod";

function readEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env: ${name}`);
	return value;
}

const client = new S3Client({
	region: readEnv("STORAGE_REGION"),
	endpoint: `https://${readEnv("STORAGE_HOST")}`,
	credentials: {
		accessKeyId: readEnv("STORAGE_ACCESS_KEY_ID"),
		secretAccessKey: readEnv("STORAGE_ACCESS_KEY"),
	},
});

export const storage = createStorage({
	bucket: process.env.STORAGE_BUCKET ?? "vs3-express-example",
	apiPath: "/api/storage",
	adapter: createAdapter({ client }),
	metadataSchema: z.object({ userId: z.string() }),
	maxFileSize: 5 * 1024 * 1024,
});
