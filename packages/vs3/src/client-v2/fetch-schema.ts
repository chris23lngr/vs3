import { createSchema } from "@better-fetch/fetch";
import { routeRegistry } from "../api/registry";
import type { StandardSchemaV1 } from "../types/standard-schema";
import type { StorageClientOptions } from "./types";

export const createFetchSchema = <
	M extends StandardSchemaV1,
	O extends StorageClientOptions<M>,
>(
	_options: O,
) => {
	return createSchema(routeRegistry);

	// return createSchema({
	// 	"/generate-upload-url": {
	// 		method: "post",
	// 		input: merge(
	// 			z.object({
	// 				file: fileInfoSchema,
	// 			}),
	// 			options.metadataSchema,
	// 		),
	// 		output: z.object({
	// 			uploadUrl: z.string(),
	// 			uploadHeaders: z.record(z.string(), z.string()),
	// 		}),
	// 	},
	// });
};
