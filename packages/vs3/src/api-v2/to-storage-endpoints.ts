import type { EndpointContext, InputContext } from "better-call";
import { runWithEndpointContext } from "../context/endpoint-context";
import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";
import type { StandardSchemaV1 } from "../types/standard-schema";
import type {
	StorageEndpoint,
	StorageEndpointOptions,
} from "./create-storage-endpoint";

// Helper type to extract metadataSchema with fallback
type ExtractMetadataSchema<O extends StorageOptions> =
	O["metadataSchema"] extends StandardSchemaV1
		? O["metadataSchema"]
		: StandardSchemaV1;

type InternalContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
> & {
	path: string;
	asResponse?: boolean | undefined;
	context: StorageContext & {
		returned?: unknown | undefined;
		responseHeaders?: Headers | undefined;
	};
};

export function toStorageEndpoints<
	O extends StorageOptions,
	const E extends Record<
		string,
		Omit<
			StorageEndpoint<
				string,
				ExtractMetadataSchema<O>,
				StorageEndpointOptions<ExtractMetadataSchema<O>>,
				any
			>,
			"wrap"
		>
	>,
>(endpoints: E, ctx: StorageContext<O> | Promise<StorageContext<O>>): E {
	const api = {} as E;

	for (const key in endpoints) {
		const endpoint = endpoints[key];

		const wrappedEndpoint = Object.assign(
			async (context: any) => {
				const storageContext = await ctx;
				const internalContext: InternalContext = {
					...context,
					context: {
						...storageContext,
					},
					path: endpoint.path,
					headers: context?.headers ? new Headers(context?.headers) : undefined,
				};

				return runWithEndpointContext(internalContext, () =>
					(endpoint as any)(internalContext),
				);
			},
			{
				path: endpoint.path,
				options: endpoint.options,
			},
		);

		(api[key] as any) = wrappedEndpoint;
	}

	return api;
}
