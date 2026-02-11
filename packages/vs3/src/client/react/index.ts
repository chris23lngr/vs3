import type { InferredTypes } from "../../types/infer";
import { createBaseClient } from "../create-client";
import type { StorageClientOptions } from "../types";
import { createUseDownload } from "./hooks/use-download";
import { createUseMultipartUpload } from "./hooks/use-multipart-upload";
import { createUseUpload } from "./hooks/use-upload";

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
