/**
 * Context passed to each middleware in the chain.
 * Accumulates results from previous middlewares via the `context` property.
 */
export type StorageMiddlewareContext<C = object> = {
	readonly method: string;
	readonly path: string;
	readonly request: Request;
	readonly headers: Headers;
	readonly context: C;
};

/**
 * Middleware handler function.
 * Returns a context object to merge into the accumulated context,
 * or undefined if the middleware does not contribute context.
 */
export type MiddlewareHandler<
	TContext = object,
	TResult extends Record<string, unknown> = Record<string, unknown>,
> = (
	ctx: StorageMiddlewareContext<TContext>,
) => Promise<TResult | undefined>;

/**
 * Configuration for a middleware.
 * `skipPaths` and `includePaths` are mutually exclusive.
 */
export type MiddlewareConfig = {
	/** Name for debugging and error messages */
	readonly name: string;
	/** Paths to skip (mutually exclusive with includePaths) */
	readonly skipPaths?: readonly string[];
	/** Paths to include (mutually exclusive with skipPaths) */
	readonly includePaths?: readonly string[];
};

/**
 * Complete middleware definition combining config and handler.
 */
export type StorageMiddleware<
	TContext = object,
	TResult extends Record<string, unknown> = Record<string, unknown>,
> = {
	readonly config: MiddlewareConfig;
	readonly handler: MiddlewareHandler<TContext, TResult>;
};

/**
 * Result from executing a middleware chain.
 */
export type ChainExecutionResult<T = object> = {
	readonly context: T;
};
