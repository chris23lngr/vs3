import type { InferredTypes } from "../../types/infer";
import { createBaseClient } from "../create-client";
import type { StorageClientOptions } from "../types";
import { createUseDownload } from "./composables/use-download";
import { createUseMultipartUpload } from "./composables/use-multipart-upload";
import { createUseUpload } from "./composables/use-upload";

export function createStorageClient<T extends InferredTypes = InferredTypes>(
	options?: StorageClientOptions<T>,
) {
	const client = createBaseClient(options ?? {});

	return {
		useUpload: createUseUpload<T>(client),
		useMultipartUpload: createUseMultipartUpload<T>(client),
		useDownload: createUseDownload<T>(client),
	};
}
