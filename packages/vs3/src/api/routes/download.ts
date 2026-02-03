import z from "zod";
import type { StorageOptions } from "../../types/options";
import { createRoute } from "../utils/route-builder";

/**
 * Download route - simplified using route builder
 * No metadata required
 */
export function createDownloadRoute<O extends StorageOptions>(options: O) {
	return createRoute(options, {
		path: "/generate-download-url",
		method: "POST",
		bodySchema: z.object({
			key: z.string(),
		}),
		requireMetadata: false, // No metadata needed for download
		handler: async ({ body, context }) => {
			const { key } = body;
			// body.metadata is undefined here

			const adapter = context.$options.adapter;
			const downloadUrl = await adapter.generatePresignedDownloadUrl(key, {
				expiresIn: 3600,
			});

			return { downloadUrl };
		},
	});
}
