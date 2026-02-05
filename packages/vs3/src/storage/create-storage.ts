import { getEndpoints, router } from "../api/router";
import { createContext } from "../context/create-context";
import { validateStorageOptions } from "../core/utils/validate-options";
import type { StorageOptions } from "../types/options";
import type { StandardSchemaV1 } from "../types/standard-schema";

export function createStorage<O extends StorageOptions>(options: O) {
	validateStorageOptions(options);

	const context = createContext(options);

	const { api } = getEndpoints(context, options);

	const { handler } = router(options, context);

	return {
		api,
		handler,
		"~options": options,
		$Infer: {
			metadata: options.metadataSchema as unknown as StandardSchemaV1<
				StandardSchemaV1.InferInput<NonNullable<O["metadataSchema"]>>,
				StandardSchemaV1.InferOutput<NonNullable<O["metadataSchema"]>>
			>,
		},
	};
}
