import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../core/error/codes";
import { StorageServerError } from "../core/error/error";
import {
	createInMemoryNonceStore,
	createRequestSigner,
} from "../core/security/request-signer";
import {
	createClientRequestSigner,
	createVerifySignatureMiddleware,
} from "./verify-signature";

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
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = await createSignedRequest(signer);
			const result = await middleware(request);

			expect(result.verified).toBe(true);
			expect(result.timestamp).toBeGreaterThan(0);
		});

		it("throws on missing signature header", async () => {
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-timestamp": Date.now().toString(),
				},
				body: "{}",
			});

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.SIGNATURE_MISSING,
				);
			}
		});

		it("throws on missing timestamp header", async () => {
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "some-signature",
				},
				body: "{}",
			});

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_MISSING,
				);
			}
		});

		it("throws on invalid timestamp format", async () => {
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "some-signature",
					"x-timestamp": "not-a-number",
				},
				body: "{}",
			});

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.TIMESTAMP_MISSING,
				);
			}
		});

		it("throws on invalid signature", async () => {
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = new Request("http://localhost/upload-url", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-signature": "invalid-signature-value",
					"x-timestamp": Date.now().toString(),
				},
				body: "{}",
			});

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.SIGNATURE_INVALID,
				);
			}
		});

		it("throws on signature with wrong secret", async () => {
			const wrongSigner = createRequestSigner({ secret: "wrong-secret" });
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const request = await createSignedRequest(wrongSigner);

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
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

			const result = await middleware(request);
			expect(result.verified).toBe(true);
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

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
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

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
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

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
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

			const result = await middleware(request);
			expect(result.verified).toBe(true);
			expect(result.nonce).toBe("unique-nonce-123");
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
			const request1 = await createSignedRequest(signer, { nonce, timestamp });
			const result1 = await middleware(request1);
			expect(result1.verified).toBe(true);

			// Second request with same nonce fails
			const request2 = await createSignedRequest(signer, { nonce, timestamp });

			await expect(middleware(request2)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request2);
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

			const result = await middleware(request);
			expect(result.verified).toBe(true);
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

			await expect(middleware(request)).rejects.toThrow(StorageServerError);
		});
	});

	describe("authHook", () => {
		it("calls authHook after signature verification", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const authHook = vi.fn().mockResolvedValue({
				authenticated: true,
				userId: "user-123",
				metadata: { role: "admin" },
			});

			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				authHook,
			});

			const request = await createSignedRequest(signer);
			const result = await middleware(request);

			expect(authHook).toHaveBeenCalledTimes(1);
			expect(result.verified).toBe(true);
			expect(result.auth).toEqual({
				userId: "user-123",
				metadata: { role: "admin" },
			});
		});

		it("throws when authHook returns not authenticated", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const authHook = vi.fn().mockResolvedValue({
				authenticated: false,
				reason: "Invalid token",
			});

			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				authHook,
			});

			const request = await createSignedRequest(signer);

			await expect(middleware(request)).rejects.toThrow(StorageServerError);

			try {
				await middleware(request);
			} catch (error) {
				expect(error).toBeInstanceOf(StorageServerError);
				expect((error as StorageServerError).code).toBe(
					StorageErrorCode.UNAUTHORIZED,
				);
			}
		});

		it("receives headers in authHook context", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const authHook = vi.fn().mockResolvedValue({ authenticated: true });

			const middleware = createVerifySignatureMiddleware({
				secret: testSecret,
				authHook,
			});

			const request = await createSignedRequest(signer);
			await middleware(request);

			expect(authHook).toHaveBeenCalledWith(
				expect.objectContaining({
					headers: expect.objectContaining({
						"content-type": "application/json",
					}),
				}),
			);
		});
	});

	describe("different HTTP methods", () => {
		it("verifies GET requests", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

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

			const result = await middleware(request);
			expect(result.verified).toBe(true);
		});

		it("verifies PUT requests with body", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

			const body = JSON.stringify({ update: true });
			const request = await createSignedRequest(signer, { method: "PUT", body });

			const result = await middleware(request);
			expect(result.verified).toBe(true);
		});

		it("verifies DELETE requests", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const middleware = createVerifySignatureMiddleware({ secret: testSecret });

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

			const result = await middleware(request);
			expect(result.verified).toBe(true);
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
		const middleware = createVerifySignatureMiddleware({ secret: testSecret });

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

		const result = await middleware(request);
		expect(result.verified).toBe(true);
	});
});
