import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import {
	createCorsMiddleware,
} from "../common/cors";
import {
	createLoggingMiddleware,
	type LogEntry,
} from "../common/logging";
import {
	createInMemoryRateLimitStore,
	createRateLimitMiddleware,
	type RateLimitStore,
} from "../common/rate-limit";
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

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/a" }),
		);
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
			expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
				"GET, POST",
			);
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
