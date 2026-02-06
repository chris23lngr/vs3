import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { createStorageMiddleware } from "../core/create-middleware";
import type { StorageMiddleware } from "../types";

/** Store for tracking request counts within time windows. */
export type RateLimitStore = {
	readonly increment: (key: string, windowMs: number) => Promise<number>;
};

/** Configuration for the rate limit middleware. */
export type RateLimitConfig = {
	readonly maxRequests: number;
	readonly windowMs: number;
	readonly store: RateLimitStore;
	readonly skipPaths?: readonly string[];
	readonly includePaths?: readonly string[];
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

/** Creates an in-memory rate limit store using fixed windows. */
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
	return createStorageMiddleware(
		{
			name: "rate-limit",
			skipPaths: config.skipPaths,
			includePaths: config.includePaths,
		},
		async (ctx) => {
			const count = await config.store.increment(ctx.path, config.windowMs);
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
