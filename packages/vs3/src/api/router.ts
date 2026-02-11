import { createRouter } from "better-call";
import z from "zod";
import { StorageError } from "../core/error/error";
import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";
import { createDownloadUrlRoute } from "./routes/download-url";
import {
	createMultipartAbortRoute,
	createMultipartCompleteRoute,
	createMultipartCreateRoute,
	createMultipartPresignPartsRoute,
} from "./routes/multipart";
import { createUploadUrlRoute } from "./routes/upload-url";
import { toStorageEndpoints } from "./to-storage-endpoints";

export function getEndpoints<O extends StorageOptions>(
	context: StorageContext<O>,
	options: O,
) {
	type MetadataSchema = O extends StorageOptions<infer M> ? M : never;

	const endpoints = {
		uploadUrl: createUploadUrlRoute(options.metadataSchema as MetadataSchema),
		downloadUrl: createDownloadUrlRoute(options.metadataSchema as MetadataSchema),
		multipartCreate: createMultipartCreateRoute(
			options.metadataSchema as MetadataSchema,
		),
		multipartPresignParts: createMultipartPresignPartsRoute(
			z.undefined() as unknown as MetadataSchema,
		),
		multipartComplete: createMultipartCompleteRoute(
			z.undefined() as unknown as MetadataSchema,
		),
		multipartAbort: createMultipartAbortRoute(
			z.undefined() as unknown as MetadataSchema,
		),
	} as const;

	const api = toStorageEndpoints<O, typeof endpoints>(endpoints, context);

	return {
		api,
	};
}

export function router<O extends StorageOptions>(
	options: O,
	context: StorageContext<O>,
) {
	const { api } = getEndpoints(context, options);

	return createRouter(api as any, {
		routerContext: {
			options,
		},
		basePath: options.apiPath,
		onError(e) {
			if (e instanceof StorageError) {
				return new Response(JSON.stringify(e.toPayload()), {
					status: e.httpStatus,
					headers: { "Content-Type": "application/json" },
				});
			}
		},
	});
}
