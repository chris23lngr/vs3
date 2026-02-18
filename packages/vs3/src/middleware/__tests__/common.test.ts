import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { createCorsMiddleware } from "../common/cors";
import { createLoggingMiddleware, type LogEntry } from "../common/logging";
import {
	createInMemoryRateLimitStore,
	createRateLimitMiddleware,
	type RateLimitKeyGenerator,
	type RateLimitStore,
	resolveClientIp,
} from "../common/rate-limit";
import {
	createRedisRateLimitStore,
	createUpstashRateLimitStore,
} from "../common/rate-limit-stores";
import { createTimeoutMiddleware } from "../common/timeout";
import { executeMiddlewareChain } from "../core/execute-chain";
import type { StorageMiddlewareContext } from "../types";

function createTestContext(
	overrides: Partial<StorageMiddlewareContext> = {},
): StorageMiddlewareContext {
	return {
		method: "POST",
		path: "/test",
		request: new Request("http://localhost/test", { method: "POST" }),
		headers: new Headers({ "content-type": "application/json" }),
		context: {},
		...overrides,
	};
}

function assertIsResponse(value: unknown): asserts value is Response {
	if (!(value instanceof Response)) {
		throw new Error("Expected Response");
	}
}

function assertIsStorageServerError(
	value: unknown,
): asserts value is StorageServerError {
	if (!(value instanceof StorageServerError)) {
		throw new Error("Expected StorageServerError");
	}
}

function hasTimeoutContext(
	value: unknown,
): value is { timeout: { signal: AbortSignal } } {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const timeoutValue = Reflect.get(value, "timeout");
	if (typeof timeoutValue !== "object" || timeoutValue === null) {
		return false;
	}

	const signalValue = Reflect.get(timeoutValue, "signal");
	return signalValue instanceof AbortSignal;
}

function assertHasTimeoutContext(
	value: unknown,
): asserts value is { timeout: { signal: AbortSignal } } {
	if (!hasTimeoutContext(value)) {
		throw new Error("Expected timeout context with AbortSignal");
	}
}

// ---------------------------------------------------------------------------
// Rate Limit - In-Memory Store
// ---------------------------------------------------------------------------

describe("createInMemoryRateLimitStore", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("returns 1 for first request", async () => {
		const store = createInMemoryRateLimitStore();
		const count = await store.increment("key", 60_000);

		expect(count).toBe(1);
	});

	it("increments for subsequent requests", async () => {
		const store = createInMemoryRateLimitStore();
		await store.increment("key", 60_000);
		const count = await store.increment("key", 60_000);

		expect(count).toBe(2);
	});

	it("resets after window expires", async () => {
		const store = createInMemoryRateLimitStore();
		await store.increment("key", 1_000);

		vi.advanceTimersByTime(1_001);
		const count = await store.increment("key", 1_000);

		expect(count).toBe(1);
	});

	it("tracks keys independently", async () => {
		const store = createInMemoryRateLimitStore();
		await store.increment("a", 60_000);
		await store.increment("a", 60_000);
		const count = await store.increment("b", 60_000);

		expect(count).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - Redis Store
// ---------------------------------------------------------------------------

describe("createRedisRateLimitStore", () => {
	it("returns count from atomic EVAL script", async () => {
		const evalCalls: unknown[][] = [];
		const client = {
			eval: vi.fn(async (...args: unknown[]) => {
				evalCalls.push(args);
				return 1;
			}),
		};

		const store = createRedisRateLimitStore({ client });
		const count = await store.increment("key", 60_000);

		expect(count).toBe(1);
		expect(evalCalls).toHaveLength(1);
		expect(evalCalls[0]).toEqual([
			expect.stringContaining("INCR"),
			1,
			"rl:key",
			60,
		]);
	});

	it("invokes EVAL on each increment", async () => {
		const client = {
			eval: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
		};

		const store = createRedisRateLimitStore({ client });
		await store.increment("key", 60_000);
		const count = await store.increment("key", 60_000);

		expect(count).toBe(2);
		expect(client.eval).toHaveBeenCalledTimes(2);
	});

	it("uses custom key prefix", async () => {
		const evalCalls: unknown[][] = [];
		const client = {
			eval: vi.fn(async (...args: unknown[]) => {
				evalCalls.push(args);
				return 1;
			}),
		};

		const store = createRedisRateLimitStore({
			client,
			keyPrefix: "ratelimit:",
		});
		await store.increment("user:123", 60_000);

		expect(evalCalls[0]?.[2]).toBe("ratelimit:user:123");
	});

	it("uses eval when available for atomic INCR+EXPIRE", async () => {
		const evalCalls: [string, number, ...string[]][] = [];
		const client = {
			incr: vi.fn(),
			expire: vi.fn(),
			eval: vi.fn(
				async (
					script: string,
					numKeys: number,
					...args: string[]
				): Promise<number> => {
					evalCalls.push([script, numKeys, ...args]);
					return 5;
				},
			),
		};

		const store = createRedisRateLimitStore({ client });
		const count = await store.increment("key", 60_000);

		expect(count).toBe(5);
		expect(client.incr).not.toHaveBeenCalled();
		expect(client.expire).not.toHaveBeenCalled();
		expect(evalCalls).toHaveLength(1);
		expect(evalCalls[0][1]).toBe(1);
		expect(evalCalls[0][2]).toBe("rl:key");
		expect(evalCalls[0][3]).toBe("60000");
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - Upstash Store
// ---------------------------------------------------------------------------

describe("createUpstashRateLimitStore", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("returns count from Upstash EVAL response", async () => {
		const url = "https://test.upstash.io";
		const token = "test-token";
		let fetchBody: unknown = null;

		vi.stubGlobal(
			"fetch",
			vi.fn(async (_: string, init?: { body?: string }) => {
				fetchBody = init?.body ? JSON.parse(init.body) : null;
				return new Response(JSON.stringify({ result: 3 }), {
					status: 200,
				});
			}),
		);

		const store = createUpstashRateLimitStore({ url, token });
		const count = await store.increment("key", 60_000);

		expect(count).toBe(3);
		expect(fetchBody).toEqual([
			"EVAL",
			expect.stringContaining("INCR"),
			"1",
			"rl:key",
			"60000",
		]);
	});

	it("throws on Upstash error response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "WRONGPASS" }), {
						status: 200,
					}),
			),
		);

		const store = createUpstashRateLimitStore({
			url: "https://test.upstash.io",
			token: "bad",
		});

		await expect(store.increment("key", 60_000)).rejects.toThrow(
			"Upstash Redis error",
		);
	});

	it("uses custom key prefix", async () => {
		let fetchBody: unknown = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_: string, init?: { body?: string }) => {
				fetchBody = init?.body ? JSON.parse(init.body) : null;
				return new Response(JSON.stringify({ result: 1 }), {
					status: 200,
				});
			}),
		);

		const store = createUpstashRateLimitStore({
			url: "https://test.upstash.io",
			token: "t",
			keyPrefix: "app:rl:",
		});
		await store.increment("path", 60_000);

		const body = fetchBody as string[];
		expect(body[3]).toBe("app:rl:path");
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - Middleware
// ---------------------------------------------------------------------------

describe("createRateLimitMiddleware allows requests within limit", () => {
	it("returns remaining count", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 5,
			windowMs: 60_000,
			store,
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 4 } });
	});
});

describe("createRateLimitMiddleware decrements remaining", () => {
	it("decrements remaining on each request", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 3,
			windowMs: 60_000,
			store,
		});

		await executeMiddlewareChain([middleware], createTestContext());
		await executeMiddlewareChain([middleware], createTestContext());
		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 0 } });
	});
});

describe("createRateLimitMiddleware exceeds limit", () => {
	it("throws RATE_LIMIT_EXCEEDED when limit exceeded", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
		});

		await executeMiddlewareChain([middleware], createTestContext());

		try {
			await executeMiddlewareChain([middleware], createTestContext());
			expect.fail("Should have thrown");
		} catch (error) {
			assertIsStorageServerError(error);
			const serverError = error;
			expect(serverError.code).toBe(StorageErrorCode.RATE_LIMIT_EXCEEDED);
			expect(serverError.message).toBe("Rate limit exceeded");
		}
	});
});

describe("createRateLimitMiddleware window reset", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("resets count after window expires", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 1_000,
			store,
		});

		await executeMiddlewareChain([middleware], createTestContext());
		vi.advanceTimersByTime(1_001);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 0 } });
	});
});

describe("createRateLimitMiddleware separate paths", () => {
	it("tracks separate paths independently", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
		});

		await executeMiddlewareChain([middleware], createTestContext({ path: "/a" }));
		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/b" }),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 0 } });
	});
});

describe("createRateLimitMiddleware custom store", () => {
	it("works with custom store implementation", async () => {
		let callCount = 0;
		const customStore: RateLimitStore = {
			async increment(): Promise<number> {
				callCount += 1;
				return callCount;
			},
		};
		const middleware = createRateLimitMiddleware({
			maxRequests: 10,
			windowMs: 60_000,
			store: customStore,
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(callCount).toBe(1);
		expect(result.context).toEqual({ rateLimit: { remaining: 9 } });
	});
});

describe("createRateLimitMiddleware skipPaths", () => {
	it("skips rate limiting for configured paths", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			skipPaths: ["/health"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/health" }),
		);

		expect(result.context).toEqual({});
	});
});

describe("createRateLimitMiddleware includePaths", () => {
	it("skips rate limiting for paths not in includePaths", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			includePaths: ["/api"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/other" }),
		);

		expect(result.context).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - resolveClientIp
// ---------------------------------------------------------------------------

describe("resolveClientIp", () => {
	it("returns first IP from x-forwarded-for", () => {
		const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
		expect(resolveClientIp(headers)).toBe("1.2.3.4");
	});

	it("returns single IP from x-forwarded-for", () => {
		const headers = new Headers({ "x-forwarded-for": "10.0.0.1" });
		expect(resolveClientIp(headers)).toBe("10.0.0.1");
	});

	it("trims whitespace from IP", () => {
		const headers = new Headers({ "x-forwarded-for": "  1.2.3.4 , 5.6.7.8" });
		expect(resolveClientIp(headers)).toBe("1.2.3.4");
	});

	it("returns unknown when header is missing", () => {
		const headers = new Headers();
		expect(resolveClientIp(headers)).toBe("unknown");
	});

	it("returns unknown when first entry is empty", () => {
		const headers = new Headers({ "x-forwarded-for": ", 1.2.3.4" });
		expect(resolveClientIp(headers)).toBe("unknown");
	});

	it("returns unknown when header is whitespace only", () => {
		const headers = new Headers({ "x-forwarded-for": "  " });
		expect(resolveClientIp(headers)).toBe("unknown");
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - Per-IP Isolation (opt-in via keyGenerator)
// ---------------------------------------------------------------------------

describe("createRateLimitMiddleware per-IP isolation", () => {
	const ipKeyGenerator: RateLimitKeyGenerator = (ctx) => {
		const ip = resolveClientIp(ctx.headers);
		return `${ip}:${ctx.path}`;
	};

	it("tracks different IPs independently on the same path", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			keyGenerator: ipKeyGenerator,
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-forwarded-for": "1.1.1.1" }),
			}),
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-forwarded-for": "2.2.2.2" }),
			}),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 0 } });
	});

	it("blocks same IP after limit on the same path", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			keyGenerator: ipKeyGenerator,
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-forwarded-for": "1.1.1.1" }),
			}),
		);

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					headers: new Headers({ "x-forwarded-for": "1.1.1.1" }),
				}),
			);
			expect.fail("Should have thrown");
		} catch (error) {
			assertIsStorageServerError(error);
			expect(error.code).toBe(StorageErrorCode.RATE_LIMIT_EXCEEDED);
		}
	});
});

// ---------------------------------------------------------------------------
// Rate Limit - Custom Key Generator
// ---------------------------------------------------------------------------

describe("createRateLimitMiddleware custom keyGenerator", () => {
	it("uses custom keyGenerator for bucket isolation", async () => {
		const store = createInMemoryRateLimitStore();
		const keyGenerator: RateLimitKeyGenerator = (ctx) => {
			const userId = ctx.headers.get("x-user-id") ?? "anonymous";
			return `user:${userId}:${ctx.path}`;
		};

		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			keyGenerator,
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-user-id": "user-a" }),
			}),
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-user-id": "user-b" }),
			}),
		);

		expect(result.context).toEqual({ rateLimit: { remaining: 0 } });
	});

	it("blocks same user after limit", async () => {
		const store = createInMemoryRateLimitStore();
		const keyGenerator: RateLimitKeyGenerator = (ctx) => {
			const userId = ctx.headers.get("x-user-id") ?? "anonymous";
			return `user:${userId}:${ctx.path}`;
		};

		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
			keyGenerator,
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ "x-user-id": "user-a" }),
			}),
		);

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					headers: new Headers({ "x-user-id": "user-a" }),
				}),
			);
			expect.fail("Should have thrown");
		} catch (error) {
			assertIsStorageServerError(error);
			expect(error.code).toBe(StorageErrorCode.RATE_LIMIT_EXCEEDED);
		}
	});

	it("default key uses path-scoped global bucket", async () => {
		const store = createInMemoryRateLimitStore();
		const middleware = createRateLimitMiddleware({
			maxRequests: 1,
			windowMs: 60_000,
			store,
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({
				path: "/shared",
				headers: new Headers({ "x-forwarded-for": "1.1.1.1" }),
			}),
		);

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					path: "/shared",
					headers: new Headers({ "x-forwarded-for": "2.2.2.2" }),
				}),
			);
			expect.fail("Should have thrown");
		} catch (error) {
			assertIsStorageServerError(error);
			expect(error.code).toBe(StorageErrorCode.RATE_LIMIT_EXCEEDED);
		}
	});
});

// ---------------------------------------------------------------------------
// CORS - Preflight
// ---------------------------------------------------------------------------

describe("createCorsMiddleware preflight with allowed origin", () => {
	it("responds with 204 and CORS headers", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					method: "OPTIONS",
					headers: new Headers({ origin: "http://example.com" }),
				}),
			);
			expect.fail("Should have thrown Response");
		} catch (response) {
			assertIsResponse(response);
			const res = response;
			expect(res.status).toBe(204);
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
				"http://example.com",
			);
		}
	});
});

describe("createCorsMiddleware preflight default methods", () => {
	it("includes default methods in preflight", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					method: "OPTIONS",
					headers: new Headers({ origin: "http://example.com" }),
				}),
			);
			expect.fail("Should have thrown Response");
		} catch (response) {
			assertIsResponse(response);
			const res = response;
			const methods = res.headers.get("Access-Control-Allow-Methods");
			expect(methods).toBe("GET, POST, PUT, DELETE, OPTIONS");
		}
	});
});

describe("createCorsMiddleware preflight default headers", () => {
	it("includes default headers in preflight", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					method: "OPTIONS",
					headers: new Headers({ origin: "http://example.com" }),
				}),
			);
			expect.fail("Should have thrown Response");
		} catch (response) {
			assertIsResponse(response);
			const res = response;
			const headers = res.headers.get("Access-Control-Allow-Headers");
			expect(headers).toBe("Content-Type, Authorization");
		}
	});
});

describe("createCorsMiddleware preflight maxAge", () => {
	it("includes maxAge when configured", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
			maxAge: 3600,
		});

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					method: "OPTIONS",
					headers: new Headers({ origin: "http://example.com" }),
				}),
			);
			expect.fail("Should have thrown Response");
		} catch (response) {
			assertIsResponse(response);
			const res = response;
			expect(res.headers.get("Access-Control-Max-Age")).toBe("3600");
		}
	});
});

describe("createCorsMiddleware preflight custom methods and headers", () => {
	it("uses custom methods and headers", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
			allowedMethods: ["GET", "POST"],
			allowedHeaders: ["X-Custom-Header"],
		});

		try {
			await executeMiddlewareChain(
				[middleware],
				createTestContext({
					method: "OPTIONS",
					headers: new Headers({ origin: "http://example.com" }),
				}),
			);
			expect.fail("Should have thrown Response");
		} catch (response) {
			assertIsResponse(response);
			const res = response;
			expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
			expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
				"X-Custom-Header",
			);
		}
	});
});

// ---------------------------------------------------------------------------
// CORS - Non-Preflight
// ---------------------------------------------------------------------------

describe("createCorsMiddleware non-preflight allowed origin", () => {
	it("returns CORS context for allowed origin", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ origin: "http://example.com" }),
			}),
		);

		expect(result.context).toEqual({
			cors: {
				allowOrigin: "http://example.com",
				allowMethods: "GET, POST, PUT, DELETE, OPTIONS",
				allowHeaders: "Content-Type, Authorization",
			},
		});
	});
});

describe("createCorsMiddleware non-preflight custom config", () => {
	it("uses custom methods and headers in context", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
			allowedMethods: ["GET", "POST"],
			allowedHeaders: ["X-Custom"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ origin: "http://example.com" }),
			}),
		);

		expect(result.context).toEqual({
			cors: {
				allowOrigin: "http://example.com",
				allowMethods: "GET, POST",
				allowHeaders: "X-Custom",
			},
		});
	});
});

describe("createCorsMiddleware disallowed origin", () => {
	it("returns empty context for disallowed origin", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ origin: "http://evil.com" }),
			}),
		);

		expect(result.context).toEqual({});
	});
});

describe("createCorsMiddleware missing origin", () => {
	it("returns empty context when origin header is missing", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({});
	});
});

describe("createCorsMiddleware wildcard origin", () => {
	it("allows any origin with wildcard", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["*"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				headers: new Headers({ origin: "http://any-origin.com" }),
			}),
		);

		expect(result.context).toEqual({
			cors: {
				allowOrigin: "http://any-origin.com",
				allowMethods: "GET, POST, PUT, DELETE, OPTIONS",
				allowHeaders: "Content-Type, Authorization",
			},
		});
	});
});

describe("createCorsMiddleware preflight disallowed origin", () => {
	it("does not throw Response for disallowed origin", async () => {
		const middleware = createCorsMiddleware({
			allowedOrigins: ["http://example.com"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({
				method: "OPTIONS",
				headers: new Headers({ origin: "http://evil.com" }),
			}),
		);

		expect(result.context).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

describe("createLoggingMiddleware logs request details", () => {
	it("calls logger with method, path, and timestamp", async () => {
		const entries: LogEntry[] = [];
		const middleware = createLoggingMiddleware({
			logger: (entry) => entries.push(entry),
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ method: "GET", path: "/api/data" }),
		);

		expect(entries).toHaveLength(1);
		expect(entries[0].method).toBe("GET");
		expect(entries[0].path).toBe("/api/data");
		expect(typeof entries[0].timestamp).toBe("number");
	});
});

describe("createLoggingMiddleware no context modification", () => {
	it("does not modify context", async () => {
		const middleware = createLoggingMiddleware({
			logger: () => {},
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({});
	});
});

describe("createLoggingMiddleware skipPaths", () => {
	it("does not log for skipped paths", async () => {
		const entries: LogEntry[] = [];
		const middleware = createLoggingMiddleware({
			logger: (entry) => entries.push(entry),
			skipPaths: ["/health"],
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/health" }),
		);

		expect(entries).toHaveLength(0);
	});
});

describe("createLoggingMiddleware includePaths", () => {
	it("does not log for paths not in includePaths", async () => {
		const entries: LogEntry[] = [];
		const middleware = createLoggingMiddleware({
			logger: (entry) => entries.push(entry),
			includePaths: ["/api"],
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/other" }),
		);

		expect(entries).toHaveLength(0);
	});
});

describe("createLoggingMiddleware logs for included paths", () => {
	it("logs when path matches includePaths", async () => {
		const entries: LogEntry[] = [];
		const middleware = createLoggingMiddleware({
			logger: (entry) => entries.push(entry),
			includePaths: ["/api"],
		});

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/api" }),
		);

		expect(entries).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe("createTimeoutMiddleware returns AbortSignal", () => {
	it("returns AbortSignal in context", async () => {
		const middleware = createTimeoutMiddleware({ timeoutMs: 5_000 });

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		assertHasTimeoutContext(result.context);
		expect(result.context.timeout.signal).toBeInstanceOf(AbortSignal);
		expect(result.context.timeout.signal.aborted).toBe(false);
	});
});

describe("createTimeoutMiddleware signal aborts after timeout", () => {
	it("aborts signal after configured timeout", async () => {
		const middleware = createTimeoutMiddleware({ timeoutMs: 10 });

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		await new Promise((resolve) => setTimeout(resolve, 50));

		assertHasTimeoutContext(result.context);
		expect(result.context.timeout.signal.aborted).toBe(true);
	});
});

describe("createTimeoutMiddleware skipPaths", () => {
	it("skips timeout for configured paths", async () => {
		const middleware = createTimeoutMiddleware({
			timeoutMs: 5_000,
			skipPaths: ["/health"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/health" }),
		);

		expect(result.context).toEqual({});
	});
});

describe("createTimeoutMiddleware includePaths", () => {
	it("skips timeout for paths not in includePaths", async () => {
		const middleware = createTimeoutMiddleware({
			timeoutMs: 5_000,
			includePaths: ["/api"],
		});

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/other" }),
		);

		expect(result.context).toEqual({});
	});
});
