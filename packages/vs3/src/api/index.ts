import { createRouter } from "better-call";
import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";
import {
	createDeleteRoute,
	createDownloadRoute,
	createUploadRoute,
} from "./routes";
import { toStorageEndpoints } from "./to-storage-endpoints";

export function getEndpoints<O extends StorageOptions>(
	context: StorageContext<O>,
	options: O,
) {
	const endpoints = {
		upload: createUploadRoute(options),
		delete: createDeleteRoute(options),
		download: createDownloadRoute(options),
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

	return createRouter(api as any, {});
}
