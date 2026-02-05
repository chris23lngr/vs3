import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";

/** Configuration for the timeout middleware. */
export type TimeoutConfig = {
	readonly timeoutMs: number;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
};

type TimeoutResult = {
	timeout: { signal: AbortSignal };
};

/**
 * Creates a timeout middleware that provides an AbortSignal to downstream handlers.
 * The signal automatically aborts after the configured timeout.
 * Handlers should pass this signal to async operations (e.g., fetch calls).
 */
export function createTimeoutMiddleware(
	config: TimeoutConfig,
): StorageMiddleware<object, TimeoutResult> {
	return createStorageMiddleware(
		{
			name: "timeout",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async () => {
			return { timeout: { signal: AbortSignal.timeout(config.timeoutMs) } };
		},
	);
}
