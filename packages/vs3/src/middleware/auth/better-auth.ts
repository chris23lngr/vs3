import type { Auth } from "better-auth";
import type { StorageMiddleware } from "../types";
import { createAuthMiddleware } from "./auth-middleware";
import type { AuthMiddlewareConfig, AuthMiddlewareResult } from "./types";

export type BetterAuthMiddlewareConfig = Omit<
	AuthMiddlewareConfig,
	"handler"
> & {
	readonly auth: Auth;
};

export function createBetterAuthMiddleware(
	config: BetterAuthMiddlewareConfig,
): StorageMiddleware<object, AuthMiddlewareResult> {
	const { auth, ...rest } = config;
	return createAuthMiddleware({
		...rest,
		handler: async ({ request }) => {
			const session = await auth.api.getSession({
				headers: request.headers,
			});

			if (!session) {
				return { authenticated: false };
			}

			return { authenticated: true, session: { userId: session.user.id } };
		},
	});
}
