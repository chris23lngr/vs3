import type { RateLimitStore } from "../rate-limit";

/**
 * Configuration for the Upstash HTTP rate limit store.
 *
 * Use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from
 * environment, or pass explicitly for serverless/edge deployments.
 */
export type UpstashRateLimitStoreConfig = {
	readonly url: string;
	readonly token: string;
	readonly keyPrefix?: string;
};

const DEFAULT_KEY_PREFIX = "rl:";

const INCR_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

function toStorageKey(prefix: string, key: string): string {
	return `${prefix}${key}`;
}

async function upstashCommand(
	url: string,
	token: string,
	command: readonly (string | number)[],
): Promise<number> {
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(command),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Upstash Redis request failed: ${res.status} ${text}`);
	}

	const json = (await res.json()) as { result?: number; error?: string };
	if (json.error) {
		throw new Error(`Upstash Redis error: ${json.error}`);
	}

	const result = json.result;
	if (typeof result !== "number") {
		throw new Error(`Upstash Redis unexpected result type: ${typeof result}`);
	}

	return result;
}

/**
 * Creates a distributed rate limit store using Upstash Redis HTTP API.
 *
 * Uses fixed-window counting with TTL. No Redis client dependency;
 * works in serverless, edge (Cloudflare Workers, Vercel Edge), and
 * Node.js. Requires Upstash Redis REST URL and token.
 *
 * @example
 * ```ts
 * import { createUpstashRateLimitStore, createRateLimitMiddleware } from "vs3";
 *
 * const store = createUpstashRateLimitStore({
 *   url: process.env.UPSTASH_REDIS_REST_URL!,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 * });
 *
 * createRateLimitMiddleware({
 *   maxRequests: 100,
 *   windowMs: 60_000,
 *   store,
 * });
 * ```
 */
export function createUpstashRateLimitStore(
	config: UpstashRateLimitStoreConfig,
): RateLimitStore {
	const { url, token, keyPrefix = DEFAULT_KEY_PREFIX } = config;

	return {
		async increment(key: string, windowMs: number): Promise<number> {
			const storageKey = toStorageKey(keyPrefix, key);
			const command = [
				"EVAL",
				INCR_WITH_TTL_SCRIPT,
				"1",
				storageKey,
				String(windowMs),
			];

			return upstashCommand(url, token, command);
		},
	};
}
