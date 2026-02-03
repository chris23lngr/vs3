import z from "zod";
import { fileInfoSchema } from "../../schemas/file";
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
			file: z.union([z.instanceof(File), fileInfoSchema]),
		}),
		requireMetadata: true, // Metadata required
		handler: async ({ body, context }) => {
			const { file } = body;
			const metadata = normalizeMetadata(body.metadata);

			const fileInfo =
				file instanceof File
					? {
							name: file.name,
							size: file.size,
							contentType: file.type,
						}
					: file;

			const adapter = context.$options.adapter;
			const uploadUrl = await adapter.generatePresignedUploadUrl(fileInfo.name, {
				contentType: fileInfo.contentType,
				size: fileInfo.size,
				name: fileInfo.name,
				metadata,
			});

			return { uploadUrl };
		},
	});
}
