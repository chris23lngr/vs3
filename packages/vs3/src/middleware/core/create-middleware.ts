import type {
	MiddlewareConfig,
	MiddlewareHandler,
	StorageMiddleware,
} from "../types";

/**
 * Creates a storage middleware from a config and handler.
 */
export function createStorageMiddleware<TContext = object, TResult = object>(
	config: MiddlewareConfig,
	handler: MiddlewareHandler<TContext, TResult>,
): StorageMiddleware<TContext, TResult> {
	return { config, handler };
}
