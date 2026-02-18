import type { RateLimitStore } from "../rate-limit";
import { DEFAULT_KEY_PREFIX, toStorageKey } from "./utils";

/**
 * Minimal Redis client interface for the rate limit store.
 *
 * Compatible with `ioredis` and `redis` (node-redis v4). Both provide
 * `incr(key)` and `expire(key, seconds)` returning promises.
 *
 * For atomic INCR+EXPIRE (avoids race on crash), provide `eval`. ioredis
 * supports it: `redis.eval(script, numKeys, ...keysAndArgs)`.
 */
export type RedisRateLimitClient = {
	readonly incr: (key: string) => Promise<number>;
	readonly expire: (key: string, seconds: number) => Promise<unknown>;
	readonly eval?: (
		script: string,
		numKeys: number,
		...args: string[]
	) => Promise<number>;
};

export type RedisRateLimitStoreConfig = {
	readonly client: RedisRateLimitClient;
	readonly keyPrefix?: string;
};

const INCR_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Creates a distributed rate limit store backed by Redis with TTL semantics.
 *
 * Uses fixed-window counting with atomic INCR+EXPIRE when the client
 * provides `eval` (e.g. ioredis). Otherwise falls back to INCR then EXPIRE;
 * a crash between them can leave a key without TTL. Suitable for
 * multi-instance deployments (e.g. Kubernetes, serverless with shared Redis).
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
	const useEval = typeof client.eval === "function";

	return {
		async increment(key: string, windowMs: number): Promise<number> {
			const storageKey = toStorageKey(keyPrefix, key);

			if (useEval && client.eval) {
				return client.eval(INCR_WITH_TTL_SCRIPT, 1, storageKey, String(windowMs));
			}

			const count = await client.incr(storageKey);
			if (count === 1) {
				const ttlSeconds = Math.ceil(windowMs / 1000);
				await client.expire(storageKey, ttlSeconds);
			}
			return count;
		},
	};
}
