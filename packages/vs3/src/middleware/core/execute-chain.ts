import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type {
	ChainExecutionResult,
	MiddlewareConfig,
	StorageMiddleware,
	StorageMiddlewareContext,
} from "../types";

/**
 * Determines whether a middleware should be skipped for a given path.
 */
function shouldSkipMiddleware(config: MiddlewareConfig, path: string): boolean {
	if (config.includePaths && config.includePaths.length > 0) {
		return !config.includePaths.includes(path);
	}
	if (config.skipPaths && config.skipPaths.length > 0) {
		return config.skipPaths.includes(path);
	}
	return false;
}

/**
 * Merges an existing context with new values from a middleware result.
 */
function mergeContext<T extends object>(
	existing: T,
	addition: object | undefined,
): T {
	if (!addition) {
		return existing;
	}
	return { ...existing, ...addition } as T;
}

/**
 * Wraps an unknown error with middleware context for better diagnostics.
 */
function createMiddlewareError(
	middlewareName: string,
	cause: unknown,
): StorageServerError {
	const message =
		cause instanceof Error ? cause.message : "Unknown middleware error";
	return new StorageServerError({
		code: StorageErrorCode.MIDDLEWARE_FAILED,
		message: `Middleware "${middlewareName}" failed: ${message}`,
		details: { middlewareName, cause: message },
	});
}

/**
 * Executes a single middleware, handling errors appropriately.
 * StorageServerError and Response instances are re-thrown as-is.
 * Other errors are wrapped with the middleware name for diagnostics.
 */
async function executeSingleMiddleware(
	middleware: StorageMiddleware,
	ctx: StorageMiddlewareContext,
): Promise<object | undefined> {
	try {
		return await middleware.handler(ctx);
	} catch (error: unknown) {
		if (error instanceof StorageServerError) {
			throw error;
		}
		if (error instanceof Response) {
			throw error;
		}
		throw createMiddlewareError(middleware.config.name, error);
	}
}

/**
 * Executes a chain of middlewares sequentially.
 * Each middleware receives the accumulated context from previous middlewares.
 * Middlewares can contribute to the context by returning an object,
 * or be a pass-through by returning void.
 */
export async function executeMiddlewareChain(
	middlewares: readonly StorageMiddleware[],
	initialContext: StorageMiddlewareContext,
): Promise<ChainExecutionResult> {
	let accumulatedContext = { ...initialContext.context };

	for (const middleware of middlewares) {
		if (shouldSkipMiddleware(middleware.config, initialContext.path)) {
			continue;
		}

		const ctx: StorageMiddlewareContext = {
			...initialContext,
			context: accumulatedContext,
		};

		const result = await executeSingleMiddleware(middleware, ctx);
		accumulatedContext = mergeContext(accumulatedContext, result);
	}

	return { context: accumulatedContext };
}
