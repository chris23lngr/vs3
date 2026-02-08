import { describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type { AuthHandler } from "../../types/auth";
import { createAuthMiddleware } from "../auth/auth-middleware";
import { executeMiddlewareChain } from "../core/execute-chain";
import type { StorageMiddlewareContext } from "../types";

function createMiddlewareContext(request: Request): StorageMiddlewareContext {
	let path: string;
	try {
		path = new URL(request.url).pathname;
	} catch {
		path = request.url;
	}
	return {
		method: request.method,
		path,
		request,
		headers: request.headers,
		context: {},
	};
}

function createRequest(
	path = "/upload-url",
	options?: { method?: string; headers?: Record<string, string> },
): Request {
	return new Request(`http://localhost${path}`, {
		method: options?.method ?? "POST",
		headers: {
			"content-type": "application/json",
			...options?.headers,
		},
	});
}

describe("createAuthMiddleware", () => {
	describe("success path", () => {
		it("returns auth context when authenticated", async () => {
			const handler: AuthHandler = () => ({
				authenticated: true,
				session: { userId: "user-123", metadata: { role: "admin" } },
			});

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);

			expect(result).toEqual({
				auth: {
					userId: "user-123",
					metadata: { role: "admin" },
				},
			});
		});

		it("works with async handlers", async () => {
			const handler: AuthHandler = async () => ({
				authenticated: true,
				session: { userId: "async-user" },
			});

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);

			expect(result).toEqual({
				auth: { userId: "async-user", metadata: undefined },
			});
		});

		it("passes request and headers to the handler", async () => {
			const handler = vi.fn<AuthHandler>().mockReturnValue({
				authenticated: true,
				session: { userId: "user-1" },
			});

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest("/test", {
				headers: { authorization: "Bearer token-abc" },
			});
			const ctx = createMiddlewareContext(request);
			await middleware.handler(ctx);

			expect(handler).toHaveBeenCalledTimes(1);
			const [arg] = handler.mock.calls[0];
			expect(arg.request).toBe(request);
			expect(arg.headers).toMatchObject({
				"content-type": "application/json",
				authorization: "Bearer token-abc",
			});
		});
	});

	describe("failure path", () => {
		it("throws UNAUTHORIZED when not authenticated", async () => {
			const handler: AuthHandler = () => ({
				authenticated: false,
				reason: "Invalid token",
			});

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);

			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.UNAUTHORIZED,
				);
				expect((error as StorageServerError).message).toBe("Invalid token");
			}
		});

		it("uses default message when no reason is provided", async () => {
			const handler: AuthHandler = () => ({ authenticated: false });

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);

			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect((error as StorageServerError).message).toBe(
					"Authentication failed.",
				);
			}
		});
	});

	describe("onAuthFailure callback", () => {
		it("delegates to onAuthFailure when provided and returns a Response", async () => {
			const handler: AuthHandler = () => ({
				authenticated: false,
				reason: "Expired",
			});

			const customResponse = new Response("Custom 401", { status: 401 });
			const onAuthFailure = vi.fn().mockReturnValue(customResponse);

			const middleware = createAuthMiddleware({ handler, onAuthFailure });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);

			await expect(middleware.handler(ctx)).rejects.toBe(customResponse);
			expect(onAuthFailure).toHaveBeenCalledWith("Expired", request);
		});

		it("falls back to StorageServerError when onAuthFailure does not return a Response", async () => {
			const handler: AuthHandler = () => ({
				authenticated: false,
				reason: "No token",
			});

			const onAuthFailure = vi.fn().mockReturnValue(undefined);

			const middleware = createAuthMiddleware({ handler, onAuthFailure });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);

			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);
		});
	});

	describe("skipPaths", () => {
		it("skips auth for configured paths", async () => {
			const handler = vi.fn<AuthHandler>();

			const middleware = createAuthMiddleware({
				handler,
				skipPaths: ["/health", "/public"],
			});

			const request = createRequest("/health", { method: "GET" });
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			expect(handler).not.toHaveBeenCalled();
			expect(
				(chainResult.context as Record<string, unknown>).auth,
			).toBeUndefined();
		});

		it("does not skip non-configured paths", async () => {
			const handler: AuthHandler = () => ({
				authenticated: true,
				session: { userId: "user-1" },
			});

			const middleware = createAuthMiddleware({
				handler,
				skipPaths: ["/health"],
			});

			const request = createRequest("/upload-url");
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			const context = chainResult.context as { auth: { userId: string } };
			expect(context.auth.userId).toBe("user-1");
		});
	});

	describe("includePaths", () => {
		it("only runs auth for included paths", async () => {
			const handler: AuthHandler = () => ({
				authenticated: true,
				session: { userId: "user-1" },
			});

			const middleware = createAuthMiddleware({
				handler,
				includePaths: ["/api/protected"],
			});

			const request = createRequest("/api/protected");
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			const context = chainResult.context as { auth: { userId: string } };
			expect(context.auth.userId).toBe("user-1");
		});

		it("skips auth for non-included paths", async () => {
			const handler = vi.fn<AuthHandler>();

			const middleware = createAuthMiddleware({
				handler,
				includePaths: ["/api/protected"],
			});

			const request = createRequest("/public");
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			expect(handler).not.toHaveBeenCalled();
			expect(
				(chainResult.context as Record<string, unknown>).auth,
			).toBeUndefined();
		});
	});

	describe("middleware chain integration", () => {
		it("adds auth context to chain result", async () => {
			const handler: AuthHandler = () => ({
				authenticated: true,
				session: { userId: "chain-user", metadata: { org: "acme" } },
			});

			const middleware = createAuthMiddleware({ handler });
			const request = createRequest();
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			const context = chainResult.context as {
				auth: { userId: string; metadata: { org: string } };
			};
			expect(context.auth.userId).toBe("chain-user");
			expect(context.auth.metadata).toEqual({ org: "acme" });
		});

		it("returns StorageMiddleware with correct config", () => {
			const handler: AuthHandler = () => ({
				authenticated: true,
				session: { userId: "u" },
			});

			const middleware = createAuthMiddleware({
				handler,
				skipPaths: ["/health"],
			});

			expect(middleware.config.name).toBe("auth");
			expect(middleware.config.skipPaths).toEqual(["/health"]);
		});
	});
});
