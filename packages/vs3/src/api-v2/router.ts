import { createRouter } from "better-call";
import z, { uppercase } from "zod";
import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";
import { createUploadRoute } from "./routes";
import { toStorageEndpoints } from "./to-storage-endpoints";

export function getEndpoints<O extends StorageOptions>(
	context: StorageContext<O>,
	options: O,
) {
	type MetadataSchema = O extends StorageOptions<infer M> ? M : never;

	const endpoints = {
		upload: createUploadRoute<MetadataSchema>(
			options.metadataSchema as MetadataSchema,
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
	});
}
