import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware, StorageMiddlewareContext } from "../types";

/** Store for tracking request counts within time windows. */
export type RateLimitStore = {
	readonly increment: (key: string, windowMs: number) => Promise<number>;
};

/**
 * Generates a rate-limit bucket key from the request context.
 *
 * Built-in helpers: {@link resolveClientIp}, or combine parts with a
 * custom function.
 *
 * **Deployment note – proxy headers:**
 * `x-forwarded-for` is only trustworthy when the app sits behind a
 * reverse proxy (nginx, Cloudflare, AWS ALB, etc.) that overwrites the
 * header. If clients can reach the server directly, they can spoof the
 * header and bypass rate limits. Configure your proxy to strip or
 * overwrite `x-forwarded-for` before it reaches the application.
 */
export type RateLimitKeyGenerator = (ctx: StorageMiddlewareContext) => string;

/** Configuration for the rate limit middleware. */
export type RateLimitConfig = {
	readonly maxRequests: number;
	readonly windowMs: number;
	readonly store: RateLimitStore;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
	/**
	 * Custom function that derives the rate-limit bucket key from the
	 * request context.
	 *
	 * Use {@link resolveClientIp} to incorporate the client IP into a
	 * custom key — but only when the deployment guarantees that a
	 * trusted reverse proxy overwrites `x-forwarded-for`.
	 *
	 * @default `ctx.path` — global per-path bucket.
	 */
	readonly keyGenerator?: RateLimitKeyGenerator;
};

type RateLimitResult = {
	rateLimit: { remaining: number };
};

function validateRateLimitConfig(config: RateLimitConfig): void {
	const isValidMax =
		Number.isFinite(config.maxRequests) && config.maxRequests > 0;
	const isValidWindow = Number.isFinite(config.windowMs) && config.windowMs > 0;

	if (!isValidMax || !isValidWindow) {
		throw new Error(
			"Rate limit middleware requires maxRequests and windowMs to be > 0",
		);
	}
}

/**
 * Extracts the client IP from the request headers.
 *
 * Reads `x-forwarded-for` (first address) and falls back to `"unknown"`.
 *
 * **Important:** This value is only trustworthy when the application
 * runs behind a reverse proxy that overwrites the header. See
 * {@link RateLimitKeyGenerator} for deployment guidance.
 */
export function resolveClientIp(headers: Headers): string {
	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0].trim();
		if (first) {
			return first;
		}
	}
	return "unknown";
}

/**
 * Creates an in-memory rate limit store using fixed windows.
 *
 * **Not suitable for distributed deployments.** Use
 * {@link createRedisRateLimitStore} or {@link createUpstashRateLimitStore}
 * when running multiple instances (Kubernetes, serverless, etc.).
 */
export function createInMemoryRateLimitStore(): RateLimitStore {
	const windows = new Map<string, { count: number; expiresAt: number }>();

	return {
		async increment(key: string, windowMs: number): Promise<number> {
			const now = Date.now();
			const entry = windows.get(key);

			if (!entry || now >= entry.expiresAt) {
				windows.set(key, { count: 1, expiresAt: now + windowMs });
				return 1;
			}

			entry.count += 1;
			return entry.count;
		},
	};
}

/** Creates a rate limit middleware that tracks requests per time window. */
export function createRateLimitMiddleware(
	config: RateLimitConfig,
): StorageMiddleware<object, RateLimitResult> {
	validateRateLimitConfig(config);
	const generateKey = config.keyGenerator ?? ((ctx) => ctx.path);

	return createStorageMiddleware(
		{
			name: "rate-limit",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async (ctx) => {
			const key = generateKey(ctx);
			const count = await config.store.increment(key, config.windowMs);
			const remaining = Math.max(0, config.maxRequests - count);

			if (count > config.maxRequests) {
				throw new StorageServerError({
					code: StorageErrorCode.RATE_LIMIT_EXCEEDED,
					message: "Rate limit exceeded",
					details: { remaining: 0 },
				});
			}

			return { rateLimit: { remaining } };
		},
	);
}
