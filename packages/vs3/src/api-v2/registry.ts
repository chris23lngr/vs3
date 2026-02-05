import z from "zod";
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
		}),
		requireMetadata: true,
		output: z.object({
			presignedUrl: z.string(),
			key: z.string(),
		}),
	},
} as const satisfies RouteRegistry;
