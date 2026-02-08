import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import {
	createInMemoryNonceStore,
	createRequestSigner,
} from "../../core/security/request-signer";
import { executeMiddlewareChain } from "../core/execute-chain";
import { createClientRequestSigner } from "../signature/client-signer";
import { createVerifySignatureMiddleware } from "../signature/verify-signature";
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

describe("createVerifySignatureMiddleware", () => {
	const testSecret = "test-middleware-secret-key";

	function createSignedRequest(
		signer: ReturnType<typeof createRequestSigner>,
		options: {
			method?: string;
			path?: string;
			body?: string;
			nonce?: string;
			timestamp?: number;
		} = {},
	): Promise<Request> {
		const method = options.method ?? "POST";
		const path = options.path ?? "/upload-url";
		const body = options.body ?? "{}";
		const timestamp = options.timestamp ?? Date.now();

		return signer
			.sign({
				method,
				path,
				body,
				nonce: options.nonce,
				timestamp,
			})
			.then((signed) => {
				const headers: Record<string, string> = {
					"content-type": "application/json",
					"x-signature": signed.signature,
					"x-timestamp": signed.timestamp.toString(),
				};

				if (signed.nonce) {
					headers["x-nonce"] = signed.nonce;
				}

				return new Request(`http://localhost${path}`, {
					method,
					headers,
					body: method !== "GET" ? body : undefined,
				});
			});
	}

	describe("basic verification", () => {
		it("verifies a valid signed request", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = await createSignedRequest(signer);
			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);

			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
			expect(result?.signature.timestamp).toBeGreaterThan(0);
		});

		it("throws on missing signature header", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-timestamp": Date.now().toString(),
				},
				body: "{}",
			});

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.SIGNATURE_MISSING,
				);
			}
		});

		it("throws on missing timestamp header", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "some-signature",
				},
				body: "{}",
			});

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_MISSING,
				);
			}
		});

		it("throws on invalid timestamp format", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "some-signature",
					"x-timestamp": "not-a-number",
				},
				body: "{}",
			});

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_MISSING,
				);
			}
		});

		it("throws on invalid signature", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "invalid-signature-value",
					"x-timestamp": Date.now().toString(),
				},
				body: "{}",
			});

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.SIGNATURE_INVALID,
				);
			}
		});

		it("throws on signature with wrong secret", async () => {
			const wrongSigner = createRequestSigner({ secret: "wrong-secret" });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = await createSignedRequest(wrongSigner);

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.SIGNATURE_INVALID,
				);
			}
		});
	});

	describe("timestamp validation", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("accepts timestamp within tolerance", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				timestampToleranceMs: 60000, // 1 minute
			});

			// Sign with timestamp 30 seconds ago
			const timestamp = Date.now() - 30000;
			const request = await createSignedRequest(signer, { timestamp });

			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);
			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
		});

		it("rejects expired timestamp", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				timestampToleranceMs: 60000, // 1 minute
			});

			// Sign with timestamp 2 minutes ago
			const timestamp = Date.now() - 120000;
			const request = await createSignedRequest(signer, { timestamp });

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_EXPIRED,
				);
			}
		});

		it("rejects future timestamp beyond tolerance", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				timestampToleranceMs: 60000, // 1 minute
			});

			// Sign with timestamp 2 minutes in future
			const timestamp = Date.now() + 120000;
			const request = await createSignedRequest(signer, { timestamp });

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_EXPIRED,
				);
			}
		});
	});

	describe("nonce validation", () => {
		it("throws when nonce required but missing", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				requireNonce: true,
			});

			const request = await createSignedRequest(signer);

			const ctx = createMiddlewareContext(request);
			await expect(middleware.handler(ctx)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.NONCE_MISSING,
				);
			}
		});

		it("verifies with valid nonce", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				requireNonce: true,
			});
			const nonceStore = createInMemoryNonceStore();
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				requireNonce: true,
				nonceStore,
			});

			const request = await createSignedRequest(signer, {
				nonce: "unique-nonce-123",
			});

			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);
			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
			expect(result?.signature.nonce).toBe("unique-nonce-123");
		});

		it("rejects reused nonce", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				requireNonce: true,
			});
			const nonceStore = createInMemoryNonceStore();
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				requireNonce: true,
				nonceStore,
			});

			const nonce = "reused-nonce";
			const timestamp = Date.now();

			// First request succeeds
			const request1 = await createSignedRequest(signer, {
				nonce,
				timestamp,
			});
			const ctx1 = createMiddlewareContext(request1);
			const result1 = await middleware.handler(ctx1);
			expect(result1).toBeDefined();
			expect(result1?.signature.verified).toBe(true);

			// Second request with same nonce fails
			const request2 = await createSignedRequest(signer, {
				nonce,
				timestamp,
			});
			const ctx2 = createMiddlewareContext(request2);

			await expect(middleware.handler(ctx2)).rejects.toThrow(StorageServerError);

			try {
				await middleware.handler(ctx2);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.NONCE_REUSED,
				);
			}
		});
	});

	describe("skipPaths", () => {
		it("skips verification for configured paths", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				skipPaths: ["/health", "/public/api"],
			});

			const request = new Request("http://localhost/health", {
				method: "GET",
			});

			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			// When skipped, no signature context is added
			expect(
				(chainResult.context as Record<string, unknown>).signature,
			).toBeUndefined();
		});

		it("does not skip verification for non-configured paths", async () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				skipPaths: ["/health"],
			});

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				body: "{}",
			});

			const ctx = createMiddlewareContext(request);
			await expect(executeMiddlewareChain([middleware], ctx)).rejects.toThrow(
				StorageServerError,
			);
		});
	});

	describe("different HTTP methods", () => {
		it("verifies GET requests", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const signed = await signer.sign({
				method: "GET",
				path: "/test",
			});

			const request = new Request("http://localhost/test", {
				method: "GET",
				headers: {
					"x-signature": signed.signature,
					"x-timestamp": signed.timestamp.toString(),
				},
			});

			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);
			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
		});

		it("verifies PUT requests with body", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const body = JSON.stringify({ update: true });
			const request = await createSignedRequest(signer, {
				method: "PUT",
				body,
			});

			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);
			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
		});

		it("verifies DELETE requests", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const signed = await signer.sign({
				method: "DELETE",
				path: "/files/123",
			});

			const request = new Request("http://localhost/files/123", {
				method: "DELETE",
				headers: {
					"x-signature": signed.signature,
					"x-timestamp": signed.timestamp.toString(),
				},
			});

			const ctx = createMiddlewareContext(request);
			const result = await middleware.handler(ctx);
			expect(result).toBeDefined();
			expect(result?.signature.verified).toBe(true);
		});
	});

	describe("middleware chain integration", () => {
		it("adds signature context to chain result", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
			});

			const request = await createSignedRequest(signer);
			const ctx = createMiddlewareContext(request);
			const chainResult = await executeMiddlewareChain([middleware], ctx);

			const context = chainResult.context as {
				signature: { verified: boolean; timestamp: number };
			};
			expect(context.signature.verified).toBe(true);
			expect(context.signature.timestamp).toBeGreaterThan(0);
		});

		it("returns StorageMiddleware with correct config", () => {
			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				skipPaths: ["/health"],
			});

			expect(middleware.config.name).toBe("verify-signature");
			expect(middleware.config.skipPaths).toEqual(["/health"]);
		});
	});
});

describe("createClientRequestSigner", () => {
	const testSecret = "client-signer-secret";

	it("signs a request with headers", async () => {
		const clientSigner = createClientRequestSigner({ secret: testSecret });

		const result = await clientSigner.sign({
			method: "POST",
			path: "/upload-url",
			body: JSON.stringify({ test: true }),
		});

		expect(result.headers["x-signature"]).toBeDefined();
		expect(result.headers["x-timestamp"]).toBeDefined();
		expect(result.timestamp).toBeGreaterThan(0);
		expect(result.signature).toHaveLength(64);
	});

	it("includes nonce in headers when provided", async () => {
		const clientSigner = createClientRequestSigner({ secret: testSecret });

		const result = await clientSigner.sign({
			method: "POST",
			path: "/upload-url",
			nonce: "client-nonce-123",
		});

		expect(result.headers["x-nonce"]).toBe("client-nonce-123");
	});

	it("produces signatures that can be verified", async () => {
		const clientSigner = createClientRequestSigner({ secret: testSecret });
		const middleware = createVerifySignatureMiddleware({
			secret: testSecret,
		});

		const body = JSON.stringify({ data: "test" });
		const { headers } = await clientSigner.sign({
			method: "POST",
			path: "/api/test",
			body,
		});

		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...headers,
			},
			body,
		});

		const ctx = createMiddlewareContext(request);
		const result = await middleware.handler(ctx);
		expect(result).toBeDefined();
		expect(result?.signature.verified).toBe(true);
	});
});
