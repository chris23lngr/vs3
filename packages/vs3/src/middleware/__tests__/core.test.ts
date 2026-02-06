import { describe, expect, it } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { createStorageMiddleware } from "../core/create-middleware";
import { executeMiddlewareChain } from "../core/execute-chain";
import type { MiddlewareHandler, StorageMiddlewareContext } from "../types";

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

describe("createStorageMiddleware", () => {
	it("creates a middleware with config and handler", () => {
		const handler = async () => ({ custom: true });
		const middleware = createStorageMiddleware(
			{ name: "test-middleware" },
			handler,
		);

		expect(middleware.config.name).toBe("test-middleware");
		expect(middleware.handler).toBe(handler);
	});
});

describe("createStorageMiddleware skipPaths config", () => {
	it("preserves skipPaths in config", () => {
		const middleware = createStorageMiddleware(
			{ name: "test", skipPaths: ["/health"] },
			async () => undefined,
		);

		expect(middleware.config.skipPaths).toEqual(["/health"]);
	});
});

describe("createStorageMiddleware includePaths config", () => {
	it("preserves includePaths in config", () => {
		const middleware = createStorageMiddleware(
			{ name: "test", includePaths: ["/api"] },
			async () => undefined,
		);

		expect(middleware.config.includePaths).toEqual(["/api"]);
	});
});

describe("createStorageMiddleware mutually exclusive paths", () => {
	it("throws when both skipPaths and includePaths are provided", () => {
		expect(() =>
			createStorageMiddleware(
				{ name: "invalid", skipPaths: ["/a"], includePaths: ["/b"] },
				async () => undefined,
			),
		).toThrow("skipPaths and includePaths are mutually exclusive");
	});
});

describe("executeMiddlewareChain sequential order", () => {
	it("executes middlewares in order", async () => {
		const order: number[] = [];

		const m1 = createStorageMiddleware({ name: "m1" }, async () => {
			order.push(1);
			return { first: true };
		});
		const m2 = createStorageMiddleware({ name: "m2" }, async () => {
			order.push(2);
			return { second: true };
		});
		const m3 = createStorageMiddleware({ name: "m3" }, async () => {
			order.push(3);
			return { third: true };
		});

		await executeMiddlewareChain([m1, m2, m3], createTestContext());

		expect(order).toEqual([1, 2, 3]);
	});
});

describe("executeMiddlewareChain empty chain", () => {
	it("returns empty context for empty chain", async () => {
		const result = await executeMiddlewareChain([], createTestContext());

		expect(result.context).toEqual({});
	});
});

describe("executeMiddlewareChain single middleware", () => {
	it("executes a single middleware", async () => {
		const middleware = createStorageMiddleware({ name: "only" }, async () => ({
			value: 42,
		}));

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext(),
		);

		expect(result.context).toEqual({ value: 42 });
	});
});

describe("executeMiddlewareChain context merging", () => {
	it("merges context from sequential middlewares", async () => {
		const m1 = createStorageMiddleware({ name: "m1" }, async () => ({ a: 1 }));
		const m2 = createStorageMiddleware({ name: "m2" }, async () => ({ b: 2 }));

		const result = await executeMiddlewareChain([m1, m2], createTestContext());

		expect(result.context).toEqual({ a: 1, b: 2 });
	});
});

describe("executeMiddlewareChain accumulated context", () => {
	it("passes accumulated context to later middleware", async () => {
		let capturedContext: unknown;

		const m1 = createStorageMiddleware({ name: "m1" }, async () => ({
			fromM1: "hello",
		}));
		const m2 = createStorageMiddleware({ name: "m2" }, async (ctx) => {
			capturedContext = ctx.context;
		});

		await executeMiddlewareChain([m1, m2], createTestContext());

		expect(capturedContext).toEqual({ fromM1: "hello" });
	});
});

describe("executeMiddlewareChain override order", () => {
	it("later values override earlier values for same key", async () => {
		const m1 = createStorageMiddleware({ name: "m1" }, async () => ({
			shared: "first",
		}));
		const m2 = createStorageMiddleware({ name: "m2" }, async () => ({
			shared: "second",
		}));

		const result = await executeMiddlewareChain([m1, m2], createTestContext());

		expect(result.context).toEqual({ shared: "second" });
	});
});

describe("executeMiddlewareChain void middleware", () => {
	it("does not mutate context when middleware returns void", async () => {
		const m1 = createStorageMiddleware({ name: "m1" }, async () => ({
			kept: true,
		}));
		const m2 = createStorageMiddleware({ name: "m2" }, async () => undefined);
		const m3 = createStorageMiddleware({ name: "m3" }, async () => ({
			added: true,
		}));

		const result = await executeMiddlewareChain(
			[m1, m2, m3],
			createTestContext(),
		);

		expect(result.context).toEqual({ kept: true, added: true });
	});
});

describe("executeMiddlewareChain skipPaths", () => {
	it("skips middleware when path is in skipPaths", async () => {
		let called = false;
		const middleware = createStorageMiddleware(
			{ name: "skipped", skipPaths: ["/health"] },
			async () => {
				called = true;
				return { shouldNotAppear: true };
			},
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/health" }),
		);

		expect(called).toBe(false);
		expect(result.context).toEqual({});
	});
});

describe("executeMiddlewareChain skipPaths not matched", () => {
	it("does not skip middleware when path is not in skipPaths", async () => {
		let called = false;
		const middleware = createStorageMiddleware(
			{ name: "not-skipped", skipPaths: ["/health"] },
			async () => {
				called = true;
				return { value: true };
			},
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/api/upload" }),
		);

		expect(called).toBe(true);
		expect(result.context).toEqual({ value: true });
	});
});

describe("executeMiddlewareChain includePaths", () => {
	it("skips middleware when path is not in includePaths", async () => {
		let called = false;
		const middleware = createStorageMiddleware(
			{ name: "restricted", includePaths: ["/api"] },
			async () => {
				called = true;
				return { restricted: true };
			},
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/public" }),
		);

		expect(called).toBe(false);
		expect(result.context).toEqual({});
	});
});

describe("executeMiddlewareChain includePaths matched", () => {
	it("runs middleware when path is in includePaths", async () => {
		let called = false;
		const middleware = createStorageMiddleware(
			{ name: "restricted", includePaths: ["/api"] },
			async () => {
				called = true;
				return { restricted: true };
			},
		);

		const result = await executeMiddlewareChain(
			[middleware],
			createTestContext({ path: "/api" }),
		);

		expect(called).toBe(true);
		expect(result.context).toEqual({ restricted: true });
	});
});

describe("executeMiddlewareChain targeted skips", () => {
	it("only skips targeted middlewares in a chain", async () => {
		const m1 = createStorageMiddleware({ name: "always" }, async () => ({
			always: true,
		}));
		const m2 = createStorageMiddleware(
			{ name: "skipped", skipPaths: ["/health"] },
			async () => ({ skipped: true }),
		);
		const m3 = createStorageMiddleware({ name: "also-always" }, async () => ({
			alsoAlways: true,
		}));

		const result = await executeMiddlewareChain(
			[m1, m2, m3],
			createTestContext({ path: "/health" }),
		);

		expect(result.context).toEqual({
			always: true,
			alsoAlways: true,
		});
	});
});

describe("executeMiddlewareChain error passthrough", () => {
	it("re-throws StorageServerError unchanged", async () => {
		const error = new StorageServerError({
			code: StorageErrorCode.SIGNATURE_INVALID,
			message: "Signature invalid",
		});
		const middleware = createStorageMiddleware({ name: "failing" }, async () => {
			throw error;
		});

		await expect(
			executeMiddlewareChain([middleware], createTestContext()),
		).rejects.toBe(error);
	});
});

describe("executeMiddlewareChain response passthrough", () => {
	it("re-throws Response instances unchanged", async () => {
		const response = new Response("Forbidden", { status: 403 });
		const middleware = createStorageMiddleware({ name: "response" }, async () => {
			throw response;
		});

		await expect(
			executeMiddlewareChain([middleware], createTestContext()),
		).rejects.toBe(response);
	});
});

describe("executeMiddlewareChain wrapped error", () => {
	it("wraps unknown errors with middleware name", async () => {
		const middleware = createStorageMiddleware(
			{ name: "broken-middleware" },
			async () => {
				throw new Error("Something went wrong");
			},
		);

		try {
			await executeMiddlewareChain([middleware], createTestContext());
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(StorageServerError);
			const serverError = error as StorageServerError;
			expect(serverError.code).toBe(StorageErrorCode.MIDDLEWARE_FAILED);
			expect(serverError.message).toContain("broken-middleware");
			expect(serverError.message).toContain("Something went wrong");
		}
	});
});

describe("executeMiddlewareChain non-Error throw", () => {
	it("wraps non-Error throws with middleware name", async () => {
		const middleware = createStorageMiddleware(
			{ name: "string-thrower" },
			async () => {
				throw "plain string error";
			},
		);

		try {
			await executeMiddlewareChain([middleware], createTestContext());
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(StorageServerError);
			const serverError = error as StorageServerError;
			expect(serverError.code).toBe(StorageErrorCode.MIDDLEWARE_FAILED);
			expect(serverError.message).toContain("string-thrower");
		}
	});
});

describe("executeMiddlewareChain invalid result", () => {
	it("rejects non-object middleware results", async () => {
		const handler = (async () => "not-an-object") as unknown as MiddlewareHandler;
		const middleware = createStorageMiddleware(
			{ name: "invalid-result" },
			handler,
		);

		try {
			await executeMiddlewareChain([middleware], createTestContext());
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(StorageServerError);
			const serverError = error as StorageServerError;
			expect(serverError.code).toBe(StorageErrorCode.MIDDLEWARE_FAILED);
			expect(serverError.message).toContain("invalid-result");
		}
	});
});

describe("executeMiddlewareChain stops on first error", () => {
	it("stops chain execution on first error", async () => {
		const order: number[] = [];

		const m1 = createStorageMiddleware({ name: "m1" }, async () => {
			order.push(1);
		});
		const m2 = createStorageMiddleware({ name: "m2" }, async () => {
			order.push(2);
			throw new StorageServerError({
				code: StorageErrorCode.FORBIDDEN,
				message: "Forbidden",
			});
		});
		const m3 = createStorageMiddleware({ name: "m3" }, async () => {
			order.push(3);
		});

		await expect(
			executeMiddlewareChain([m1, m2, m3], createTestContext()),
		).rejects.toThrow(StorageServerError);

		expect(order).toEqual([1, 2]);
	});
});

describe("executeMiddlewareChain method passthrough", () => {
	it("passes request details to middleware handler", async () => {
		let capturedMethod: string | undefined;
		let capturedPath: string | undefined;

		const middleware = createStorageMiddleware(
			{ name: "inspector" },
			async (ctx) => {
				capturedMethod = ctx.method;
				capturedPath = ctx.path;
			},
		);

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ method: "PUT", path: "/upload" }),
		);

		expect(capturedMethod).toBe("PUT");
		expect(capturedPath).toBe("/upload");
	});
});

describe("executeMiddlewareChain headers passthrough", () => {
	it("passes headers to middleware handler", async () => {
		let capturedHeaders: Headers | undefined;
		const headers = new Headers({ authorization: "Bearer token123" });

		const middleware = createStorageMiddleware(
			{ name: "header-reader" },
			async (ctx) => {
				capturedHeaders = ctx.headers;
			},
		);

		await executeMiddlewareChain([middleware], createTestContext({ headers }));

		expect(capturedHeaders?.get("authorization")).toBe("Bearer token123");
	});
});

describe("executeMiddlewareChain request passthrough", () => {
	it("passes request to middleware handler", async () => {
		let capturedRequest: Request | undefined;
		const request = new Request("http://localhost/test", {
			method: "DELETE",
		});

		const middleware = createStorageMiddleware(
			{ name: "request-reader" },
			async (ctx) => {
				capturedRequest = ctx.request;
			},
		);

		await executeMiddlewareChain(
			[middleware],
			createTestContext({ request, method: "DELETE" }),
		);

		expect(capturedRequest?.method).toBe("DELETE");
	});
});
