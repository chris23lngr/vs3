import z from "zod";
import type { StorageOptions } from "../../types/options";
import { createRoute } from "../utils/route-builder";
import { normalizeMetadata } from "../utils/metadata";

/**
 * Upload route - simplified using route builder
 */
export function createUploadRoute<O extends StorageOptions>(options: O) {
	return createRoute(options, {
		path: "/generate-upload-url",
		method: "POST",
		bodySchema: z.object({
			file: z.instanceof(File),
		}),
		requireMetadata: true, // Metadata required
		handler: async ({ body, context }) => {
			const { file } = body;
			const metadata = normalizeMetadata(body.metadata);

			const adapter = context.$options.adapter;
			const uploadUrl = await adapter.generatePresignedUploadUrl(file.name, {
				contentType: file.type,
				size: file.size,
				name: file.name,
				metadata,
			});

			return { uploadUrl };
		},
	});
}
