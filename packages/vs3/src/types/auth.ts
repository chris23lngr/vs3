/**
 * Context provided to an auth handler for evaluating authentication.
 */
export type AuthHandlerContext = {
	readonly request: Request;
	readonly headers: Readonly<Record<string, string>>;
};

/**
 * Authenticated session data.
 * `userId` is required — if the user is authenticated, an identifier must exist.
 */
export type AuthSession = {
	readonly userId: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Result of an authentication check.
 */
export type AuthResult =
	| { readonly authenticated: true; readonly session: AuthSession }
	| { readonly authenticated: false; readonly reason?: string };

/**
 * User-provided function that evaluates whether a request is authenticated.
 * Must return an `AuthResult` (or a promise of one).
 */
export type AuthHandler = (
	context: AuthHandlerContext,
) => AuthResult | Promise<AuthResult>;
