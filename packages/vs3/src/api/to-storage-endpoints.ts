import type { EndpointContext, InputContext } from "better-call";
import { runWithEndpointContext } from "../context/endpoint-context";
import { StorageErrorCode } from "../core/error/codes";
import { StorageServerError } from "../core/error/error";
import { executeMiddlewareChain } from "../middleware/core/execute-chain";
import type {
	StorageMiddleware,
	StorageMiddlewareContext,
} from "../middleware/types";
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

function resolveMethod(context: Record<string, unknown>): string {
	return typeof context?.method === "string" ? context.method : "POST";
}

function buildMiddlewareRequest(
	endpointPath: string,
	context: Record<string, unknown>,
): Request {
	if (context?.request instanceof Request) return context.request;
	return new Request(`http://localhost${endpointPath}`, {
		method: resolveMethod(context),
	});
}

async function runGlobalMiddlewares(
	middlewares: readonly StorageMiddleware[],
	endpointPath: string,
	context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const request = buildMiddlewareRequest(endpointPath, context);
	const headers =
		context?.headers instanceof Headers ? context.headers : request.headers;

	const middlewareCtx: StorageMiddlewareContext = {
		method: resolveMethod(context),
		path: endpointPath,
		request,
		headers,
		context: {},
	};

	const { context: result } = await executeMiddlewareChain(
		middlewares,
		middlewareCtx,
	);
	return result;
}

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

				// Validate that storageContext has the required $options property
				if (
					storageContext === null ||
					storageContext === undefined ||
					storageContext.$options === null ||
					storageContext.$options === undefined
				) {
					throw new StorageServerError({
						code: StorageErrorCode.INTERNAL_SERVER_ERROR,
						message: "Invalid storage context.",
						details:
							"Storage context or $options is missing. This is a programming error. " +
							"Ensure you are using createContext() to create the storage context and passing it to the router.",
					});
				}

				const middlewares = storageContext.$options?.middlewares;
				const middlewareResult = middlewares?.length
					? await runGlobalMiddlewares(
							middlewares,
							endpoint.path,
							context ?? {},
						)
					: undefined;

				const internalContext: InternalContext = {
					...context,
					context: {
						...storageContext,
						$middleware: middlewareResult,
					},
					path: endpoint.path,
					headers: context?.headers
						? new Headers(context?.headers)
						: undefined,
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
