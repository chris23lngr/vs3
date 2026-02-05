import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";

/** Configuration for the CORS middleware. */
export type CorsConfig = {
	readonly allowedOrigins: readonly string[];
	readonly allowedMethods?: readonly string[];
	readonly allowedHeaders?: readonly string[];
	readonly maxAge?: number;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
};

type CorsResult = {
	cors: {
		allowOrigin: string;
		allowMethods: string;
		allowHeaders: string;
	};
};

const DEFAULT_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
const DEFAULT_HEADERS = ["Content-Type", "Authorization"];

function isOriginAllowed(
	origin: string,
	allowedOrigins: readonly string[],
): boolean {
	return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

function buildPreflightHeaders(
	origin: string,
	config: CorsConfig,
): Record<string, string> {
	const methods = (config.allowedMethods ?? DEFAULT_METHODS).join(", ");
	const headers = (config.allowedHeaders ?? DEFAULT_HEADERS).join(", ");

	const result: Record<string, string> = {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": methods,
		"Access-Control-Allow-Headers": headers,
	};

	if (config.maxAge !== undefined) {
		result["Access-Control-Max-Age"] = String(config.maxAge);
	}

	return result;
}

/**
 * Creates a CORS middleware that handles preflight requests
 * and provides CORS headers in context for non-preflight requests.
 */
export function createCorsMiddleware(
	config: CorsConfig,
): StorageMiddleware<object, CorsResult> {
	return createStorageMiddleware(
		{
			name: "cors",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async (ctx) => {
			const origin = ctx.headers.get("origin");
			if (!origin || !isOriginAllowed(origin, config.allowedOrigins)) {
				return undefined;
			}

			if (ctx.method === "OPTIONS") {
				throw new Response(null, {
					status: 204,
					headers: buildPreflightHeaders(origin, config),
				});
			}

			const methods = (config.allowedMethods ?? DEFAULT_METHODS).join(", ");
			const headers = (config.allowedHeaders ?? DEFAULT_HEADERS).join(", ");

			return {
				cors: {
					allowOrigin: origin,
					allowMethods: methods,
					allowHeaders: headers,
				},
			};
		},
	);
}
