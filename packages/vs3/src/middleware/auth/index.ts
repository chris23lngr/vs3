export { createAuthMiddleware } from "./auth-middleware";
export {
	type BetterAuthMiddlewareConfig,
	createBetterAuthMiddleware,
	createBetterAuthMiddleware as createBetterAuth,
	createBetterAuthMiddleware as betterAuth,
} from "./better-auth";
export type { AuthMiddlewareConfig, AuthMiddlewareResult } from "./types";
