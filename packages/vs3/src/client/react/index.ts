import type { StandardSchemaV1 } from "../../types/standard-schema";
import { createBaseClient } from "../create-client";
import type { StorageClientOptions } from "../types";
import { createUseDownload } from "./hooks/use-download";
import { createUseUpload } from "./hooks/use-upload";

export function createStorageClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
>(options?: StorageClientOptions<M>) {
	const client = createBaseClient(options ?? {});

	return {
		useUpload: createUseUpload<M>(client),
		useDownload: createUseDownload<M>(client),
	};
}
