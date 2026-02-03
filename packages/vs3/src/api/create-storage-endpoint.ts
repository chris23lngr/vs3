import type { EndpointContext, EndpointOptions } from "better-call";
import { createEndpoint, createMiddleware } from "better-call";
import { runWithEndpointContext } from "../context/endpoint-context";
import type { StorageContext } from "../types/context";

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as StorageContext;
});

export const createStorageMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown | undefined;
				responseHeaders?: Headers | undefined;
			};
		}),
	],
});

const use = [optionsMiddleware];

type EndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = (context: EndpointContext<Path, Options, StorageContext>) => Promise<R>;

export function createStorageEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
>(path: Path, options: Opts, handler: EndpointHandler<Path, Opts, R>) {
	return createEndpoint(
		path,
		{
			...options,
			use: [...(options?.use || []), ...use],
		},
		async (ctx) => runWithEndpointContext(ctx as any, () => handler(ctx)),
	);
}

export type StorageEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
> = ReturnType<typeof createStorageEndpoint<Path, Opts, R>>;
export type StorageMiddleware = ReturnType<typeof createStorageMiddleware>;
