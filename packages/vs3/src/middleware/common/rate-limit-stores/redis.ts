import type { RateLimitStore } from "../rate-limit";

/**
 * Minimal Redis client interface for the rate limit store.
 *
 * Compatible with `ioredis` and `redis` (node-redis v4) by exposing
 * a normalized `eval` method.
 */
export type RedisRateLimitClient = {
	readonly eval: (
		script: string,
		numberOfKeys: number,
		...args: readonly (string | number)[]
	) => Promise<number>;
};

export type RedisRateLimitStoreConfig = {
	readonly client: RedisRateLimitClient;
	readonly keyPrefix?: string;
};

const DEFAULT_KEY_PREFIX = "rl:";

const INCR_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

function toStorageKey(prefix: string, key: string): string {
	return `${prefix}${key}`;
}

/**
 * Creates a distributed rate limit store backed by Redis with TTL semantics.
 *
 * Uses fixed-window counting: INCR for the bucket key, EXPIRE on first
 * request to auto-cleanup after the window. Suitable for multi-instance
 * deployments (e.g. Kubernetes, serverless with shared Redis).
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { createRedisRateLimitStore, createRateLimitMiddleware } from "vs3";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const store = createRedisRateLimitStore({ client: redis });
 *
 * createRateLimitMiddleware({
 *   maxRequests: 100,
 *   windowMs: 60_000,
 *   store,
 * });
 * ```
 */
export function createRedisRateLimitStore(
	config: RedisRateLimitStoreConfig,
): RateLimitStore {
	const { client, keyPrefix = DEFAULT_KEY_PREFIX } = config;

	return {
		async increment(key: string, windowMs: number): Promise<number> {
			const storageKey = toStorageKey(keyPrefix, key);
			const ttlSeconds = Math.ceil(windowMs / 1000);
			const count = await client.eval(
				INCR_WITH_TTL_SCRIPT,
				1,
				storageKey,
				ttlSeconds,
			);

			return count;
		},
	};
}
