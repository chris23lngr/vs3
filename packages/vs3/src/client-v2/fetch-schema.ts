import { createSchema } from "@better-fetch/fetch";
import z from "zod";
import { mergeSchema } from "../core/utils/merge-schema";
import { fileInfoSchema } from "../schemas/file";
import type { StandardSchemaV1 } from "../types/standard-schema";
import type { StorageClientOptions } from "./types";

export const createFetchSchema = <O extends StorageClientOptions>(
	options: O,
) => {
	const merge = <
		Z extends z.ZodObject<z.ZodRawShape>,
		S extends StandardSchemaV1,
	>(
		zodSchema: Z,
		standardSchema: S | undefined,
	) => {
		if (!standardSchema) {
			return zodSchema;
		}

		return mergeSchema(zodSchema, standardSchema);
	};

	return createSchema({
		"/generate-upload-url": {
			method: "post",
			input: merge(
				z.object({
					file: fileInfoSchema,
				}),
				options.metadataSchema,
			),
			output: z.object({
				uploadUrl: z.string(),
				uploadHeaders: z.record(z.string(), z.string()),
			}),
		},
	});
};
