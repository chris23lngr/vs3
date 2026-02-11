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
	"/multipart/create": {
		body: z.object({
			fileInfo: fileInfoSchema,
			acl: z.enum(["public-read", "private"]).optional(),
			encryption: s3EncryptionSchema.optional(),
		}),
		requireMetadata: true,
		output: z.object({
			uploadId: z.string(),
			key: z.string(),
		}),
	},
	"/multipart/presign-parts": {
		body: z.object({
			key: z.string().min(1),
			uploadId: z.string().min(1),
			parts: z.array(z.object({ partNumber: z.number().int().min(1) })),
			encryption: s3EncryptionSchema.optional(),
		}),
		requireMetadata: false,
		output: z.object({
			parts: z.array(
				z.object({
					partNumber: z.number().int().min(1),
					presignedUrl: z.string(),
					uploadHeaders: z.record(z.string(), z.string()).optional(),
				}),
			),
		}),
	},
	"/multipart/complete": {
		body: z.object({
			key: z.string().min(1),
			uploadId: z.string().min(1),
			parts: z.array(
				z.object({
					partNumber: z.number().int().min(1),
					eTag: z.string().min(1),
				}),
			),
		}),
		requireMetadata: false,
		output: z.object({
			key: z.string(),
		}),
	},
	"/multipart/abort": {
		body: z.object({
			key: z.string().min(1),
			uploadId: z.string().min(1),
		}),
		requireMetadata: false,
		output: z.object({
			success: z.boolean(),
		}),
	},
} as const satisfies RouteRegistry;
