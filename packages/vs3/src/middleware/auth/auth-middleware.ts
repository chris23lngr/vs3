import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";
import { resolveHeaders } from "./resolve-headers";
import type { AuthMiddlewareConfig, AuthMiddlewareResult } from "./types";

/**
 * Creates a standalone authentication middleware.
 *
 * Calls `config.handler` with the request and headers. On success, adds
 * `{ auth: { userId, metadata } }` to the middleware chain context.
 * On failure, throws `StorageServerError(UNAUTHORIZED)` or delegates
 * to `config.onAuthFailure` if provided.
 */
export function createAuthMiddleware(
	config: AuthMiddlewareConfig,
): StorageMiddleware<object, AuthMiddlewareResult> {
	return createStorageMiddleware(
		{
			name: "auth",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async (ctx) => {
			const headers = resolveHeaders(ctx.request);
			const result = await config.handler({ request: ctx.request, headers });

			if (result.authenticated) {
				return {
					auth: {
						userId: result.session.userId,
						metadata: result.session.metadata,
					},
				};
			}

			const reason = result.reason ?? "Authentication failed.";

			if (config.onAuthFailure) {
				const response = config.onAuthFailure(reason, ctx.request);
				if (response instanceof Response) {
					throw response;
				}
			}

			throw new StorageServerError({
				code: StorageErrorCode.UNAUTHORIZED,
				message: reason,
				details: undefined,
			});
		},
	);
}
