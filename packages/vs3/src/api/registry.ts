import z from "zod";
import { s3EncryptionSchema } from "../schemas/encryption";
import { fileInfoSchema } from "../schemas/file";
import type { StandardSchemaV1 } from "../types/standard-schema";

type RouteRegistry = Record<
	`/${string}`,
	{
		body: StandardSchemaV1;
		requireMetadata?: boolean;
		output: StandardSchemaV1;
	}
>;

export const routeRegistry = {
	"/upload-url": {
		body: z.object({
			fileInfo: fileInfoSchema,
			expiresIn: z.number().optional(),
			acl: z.enum(["public-read", "private"]).optional(),
			encryption: s3EncryptionSchema.optional(),
		}),
		requireMetadata: true,
		output: z.object({
			presignedUrl: z.string(),
			key: z.string(),
			uploadHeaders: z.record(z.string(), z.string()).optional(),
		}),
	},
	"/download-url": {
		body: z.object({
			key: z.string().min(1),
			expiresIn: z.number().optional(),
			encryption: s3EncryptionSchema.optional(),
		}),
		requireMetadata: false,
		output: z.object({
			presignedUrl: z.string(),
			downloadHeaders: z.record(z.string(), z.string()).optional(),
		}),
	},
	"/sign-request": {
		body: z.object({
			method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
			path: z.string().min(1),
			body: z.string().optional(),
		}),
		requireMetadata: false,
		output: z.object({
			headers: z.record(z.string(), z.string()),
		}),
	},
} as const satisfies RouteRegistry;
