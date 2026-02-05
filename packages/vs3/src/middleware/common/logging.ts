import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";

/** Log entry describing an incoming request. */
export type LogEntry = {
	readonly method: string;
	readonly path: string;
	readonly timestamp: number;
};

/** Logger function that receives request log entries. */
export type LogFn = (entry: LogEntry) => void;

/** Configuration for the logging middleware. */
export type LoggingConfig = {
	readonly logger: LogFn;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
};

/** Creates a logging middleware that logs incoming request details. */
export function createLoggingMiddleware(
	config: LoggingConfig,
): StorageMiddleware {
	return createStorageMiddleware(
		{
			name: "logging",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async (ctx) => {
			config.logger({
				method: ctx.method,
				path: ctx.path,
				timestamp: Date.now(),
			});
			return undefined;
		},
	);
}
