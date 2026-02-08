import type { AuthHandler } from "../../types/auth";

/**
 * Configuration for the authentication middleware.
 */
export type AuthMiddlewareConfig = {
	readonly handler: AuthHandler;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
	readonly onAuthFailure?: (
		reason: string,
		request: Request,
	) => Response | never;
};

/**
 * Result added to the middleware chain context on successful authentication.
 */
export type AuthMiddlewareResult = {
	auth: {
		readonly userId: string;
		readonly metadata?: Readonly<Record<string, unknown>>;
	};
};
