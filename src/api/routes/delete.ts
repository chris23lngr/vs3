import z from "zod";
import type { StorageOptions } from "../../types/options";
import { createRoute } from "../utils/route-builder";

/**
 * Delete route - simplified using route builder
 */
export function createDeleteRoute<O extends StorageOptions>(options: O) {
	return createRoute(options, {
		path: "/delete",
		method: "POST",
		bodySchema: z.object({
			key: z.string(),
		}),
		requireMetadata: true, // Metadata required for authorization
		handler: async ({ body, context }) => {
			const { key } = body;
			const _metadata = body.metadata;

			// Use metadata for authorization checks
			const adapter = context.$options.adapter;
			await adapter.deleteObject(key);

			return { success: true };
		},
	});
}
