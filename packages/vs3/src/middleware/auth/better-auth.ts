import type { Auth } from "better-auth";
import { createAuthMiddleware } from "./auth-middleware";
import type { AuthMiddlewareConfig } from "./types";

type BetterAuthMiddlewareConfig = Omit<AuthMiddlewareConfig, "handler"> & {
	auth: Auth;
};

export function createBetterAuthMiddleware(config: BetterAuthMiddlewareConfig) {
	return createAuthMiddleware({
		handler: async ({ request, headers }) => {
			const internalHeaders: Headers = new Headers({
				...request.headers,
				...headers,
			});

			const session = await config.auth.api.getSession({
				headers: internalHeaders,
			});

			if (!session) {
				return { authenticated: false };
			}

			return { authenticated: true, session: { userId: session.user.id } };
		},
		...config,
	});
}
