import { S3Client } from "@aws-sdk/client-s3";
import { createAdapter, createStorage } from "vs3";
import { z } from "zod";

function readRequiredEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}

	return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
	const value = process.env[name];

	if (value === undefined) {
		return fallback;
	}

	return value === "true";
}

function createS3Client(): S3Client {
	const host = readRequiredEnv("STORAGE_HOST");
	const region = readRequiredEnv("STORAGE_REGION");
	const secure = readBooleanEnv("STORAGE_SECURE", true);
	const forcePathStyle = readBooleanEnv("STORAGE_FORCE_PATH_STYLE", false);

	const protocol = secure ? "https" : "http";
	const endpoint = `${protocol}://${host}`;

	return new S3Client({
		region,
		endpoint,
		forcePathStyle,
		credentials: {
			accessKeyId: readRequiredEnv("STORAGE_ACCESS_KEY_ID"),
			secretAccessKey: readRequiredEnv("STORAGE_ACCESS_KEY"),
		},
	});
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
	if (!s3Client) {
		s3Client = createS3Client();
	}

	return s3Client;
}

export const storage = createStorage({
	bucket: process.env.STORAGE_BUCKET ?? "vs3-vue-example",
	apiPath: "/api/storage",
	adapter: createAdapter({ client: getS3Client() }),
	metadataSchema: z.object({
		userId: z.string().min(1),
	}),
	maxFileSize: 5 * 1024 * 1024,
});
