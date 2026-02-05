import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createInMemoryNonceStore,
	createRequestSigner,
	generateNonce,
} from "./request-signer";

describe("createRequestSigner", () => {
	const testSecret = "test-secret-key-with-sufficient-length";

	describe("sign", () => {
		it("signs a request with default algorithm", async () => {
			const signer = createRequestSigner({ secret: testSecret });

			const result = await signer.sign({
				method: "POST",
				path: "/upload-url",
				body: JSON.stringify({ fileInfo: { name: "test.txt" } }),
			});

			expect(result.signature).toBeDefined();
			expect(result.signature).toHaveLength(64); // SHA-256 produces 64 hex chars
			expect(result.timestamp).toBeGreaterThan(0);
			expect(result.headers["x-signature"]).toBe(result.signature);
			expect(result.headers["x-timestamp"]).toBe(result.timestamp.toString());
		});

		it("includes nonce in headers when provided", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const nonce = "unique-nonce-123";

			const result = await signer.sign({
				method: "POST",
				path: "/upload-url",
				body: "{}",
				nonce,
			});

			expect(result.nonce).toBe(nonce);
			expect(result.headers["x-nonce"]).toBe(nonce);
		});

		it("uses custom timestamp when provided", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const customTimestamp = 1700000000000;

			const result = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp: customTimestamp,
			});

			expect(result.timestamp).toBe(customTimestamp);
		});

		it("produces different signatures for different methods", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const getResult = await signer.sign({
				method: "GET",
				path: "/test",
				timestamp,
			});

			const postResult = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp,
			});

			expect(getResult.signature).not.toBe(postResult.signature);
		});

		it("produces different signatures for different paths", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const result1 = await signer.sign({
				method: "POST",
				path: "/path1",
				timestamp,
			});

			const result2 = await signer.sign({
				method: "POST",
				path: "/path2",
				timestamp,
			});

			expect(result1.signature).not.toBe(result2.signature);
		});

		it("produces different signatures for different bodies", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const result1 = await signer.sign({
				method: "POST",
				path: "/test",
				body: JSON.stringify({ a: 1 }),
				timestamp,
			});

			const result2 = await signer.sign({
				method: "POST",
				path: "/test",
				body: JSON.stringify({ a: 2 }),
				timestamp,
			});

			expect(result1.signature).not.toBe(result2.signature);
		});

		it("produces different signatures with different secrets", async () => {
			const signer1 = createRequestSigner({ secret: "secret-1" });
			const signer2 = createRequestSigner({ secret: "secret-2" });
			const timestamp = Date.now();

			const result1 = await signer1.sign({
				method: "POST",
				path: "/test",
				timestamp,
			});

			const result2 = await signer2.sign({
				method: "POST",
				path: "/test",
				timestamp,
			});

			expect(result1.signature).not.toBe(result2.signature);
		});

		it("supports SHA-384 algorithm", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				algorithm: "SHA-384",
			});

			const result = await signer.sign({
				method: "POST",
				path: "/test",
			});

			expect(result.signature).toHaveLength(96); // SHA-384 produces 96 hex chars
		});

		it("supports SHA-512 algorithm", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				algorithm: "SHA-512",
			});

			const result = await signer.sign({
				method: "POST",
				path: "/test",
			});

			expect(result.signature).toHaveLength(128); // SHA-512 produces 128 hex chars
		});

		it("handles empty body", async () => {
			const signer = createRequestSigner({ secret: testSecret });

			const result = await signer.sign({
				method: "GET",
				path: "/test",
			});

			expect(result.signature).toBeDefined();
		});
	});

	describe("verify", () => {
		it("verifies a valid signature", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const signed = await signer.sign({
				method: "POST",
				path: "/upload-url",
				body: '{"test": true}',
				timestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/upload-url",
				body: '{"test": true}',
				signature: signed.signature,
				timestamp,
			});

			expect(result).toEqual({ valid: true });
		});

		it("rejects signature with wrong body", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const signed = await signer.sign({
				method: "POST",
				path: "/upload-url",
				body: '{"original": true}',
				timestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/upload-url",
				body: '{"modified": true}',
				signature: signed.signature,
				timestamp,
			});

			expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
		});

		it("rejects signature with wrong method", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const signed = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp,
			});

			const result = await signer.verify({
				method: "PUT",
				path: "/test",
				signature: signed.signature,
				timestamp,
			});

			expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
		});

		it("rejects signature with wrong path", async () => {
			const signer = createRequestSigner({ secret: testSecret });
			const timestamp = Date.now();

			const signed = await signer.sign({
				method: "POST",
				path: "/original-path",
				timestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/modified-path",
				signature: signed.signature,
				timestamp,
			});

			expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
		});

		it("rejects expired timestamp", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				timestampToleranceMs: 1000, // 1 second
			});
			const oldTimestamp = Date.now() - 5000; // 5 seconds ago

			const signed = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp: oldTimestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/test",
				signature: signed.signature,
				timestamp: oldTimestamp,
			});

			expect(result).toEqual({ valid: false, reason: "timestamp_expired" });
		});

		it("rejects future timestamp", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				timestampToleranceMs: 1000, // 1 second
			});
			const futureTimestamp = Date.now() + 5000; // 5 seconds in future

			const signed = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp: futureTimestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/test",
				signature: signed.signature,
				timestamp: futureTimestamp,
			});

			expect(result).toEqual({ valid: false, reason: "timestamp_expired" });
		});

		it("accepts timestamp within tolerance", async () => {
			const signer = createRequestSigner({
				secret: testSecret,
				timestampToleranceMs: 60000, // 1 minute
			});
			const timestamp = Date.now() - 30000; // 30 seconds ago

			const signed = await signer.sign({
				method: "POST",
				path: "/test",
				timestamp,
			});

			const result = await signer.verify({
				method: "POST",
				path: "/test",
				signature: signed.signature,
				timestamp,
			});

			expect(result).toEqual({ valid: true });
		});

		it("rejects invalid timestamp (NaN)", async () => {
			const signer = createRequestSigner({ secret: testSecret });

			const result = await signer.verify({
				method: "POST",
				path: "/test",
				signature: "any-signature",
				timestamp: Number.NaN,
			});

			expect(result).toEqual({ valid: false, reason: "timestamp_invalid" });
		});

		describe("with requireNonce", () => {
			it("rejects missing nonce when required", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: true,
				});
				const timestamp = Date.now();

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
				});

				const result = await signer.verify({
					method: "POST",
					path: "/test",
					signature: signed.signature,
					timestamp,
				});

				expect(result).toEqual({ valid: false, reason: "nonce_missing" });
			});

			it("rejects when nonce store is missing", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: true,
				});
				const timestamp = Date.now();
				const nonce = "missing-store-nonce";

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
					nonce,
				});

				const result = await signer.verify({
					method: "POST",
					path: "/test",
					signature: signed.signature,
					timestamp,
					nonce,
				});

				expect(result).toEqual({ valid: false, reason: "nonce_store_missing" });
			});

			it("verifies with valid nonce", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: true,
				});
				const nonceStore = createInMemoryNonceStore();
				const timestamp = Date.now();
				const nonce = "unique-nonce";

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
					nonce,
				});

				const result = await signer.verify(
					{
						method: "POST",
						path: "/test",
						signature: signed.signature,
						timestamp,
						nonce,
					},
					nonceStore,
				);

				expect(result).toEqual({ valid: true });
			});

			it("rejects reused nonce", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: true,
				});
				const nonceStore = createInMemoryNonceStore();
				const timestamp = Date.now();
				const nonce = "reused-nonce";

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
					nonce,
				});

				// First verification should succeed
				const result1 = await signer.verify(
					{
						method: "POST",
						path: "/test",
						signature: signed.signature,
						timestamp,
						nonce,
					},
					nonceStore,
				);

				expect(result1).toEqual({ valid: true });

				// Second verification with same nonce should fail
				const result2 = await signer.verify(
					{
						method: "POST",
						path: "/test",
						signature: signed.signature,
						timestamp,
						nonce,
					},
					nonceStore,
				);

				expect(result2).toEqual({ valid: false, reason: "nonce_reused" });
			});
		});

		describe("with optional nonce", () => {
			it("verifies without nonce when not required", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: false,
				});
				const timestamp = Date.now();

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
				});

				const result = await signer.verify({
					method: "POST",
					path: "/test",
					signature: signed.signature,
					timestamp,
				});

				expect(result).toEqual({ valid: true });
			});

			it("still checks for nonce reuse when provided", async () => {
				const signer = createRequestSigner({
					secret: testSecret,
					requireNonce: false,
				});
				const nonceStore = createInMemoryNonceStore();
				const timestamp = Date.now();
				const nonce = "optional-nonce";

				const signed = await signer.sign({
					method: "POST",
					path: "/test",
					timestamp,
					nonce,
				});

				// First request with nonce succeeds
				await signer.verify(
					{
						method: "POST",
						path: "/test",
						signature: signed.signature,
						timestamp,
						nonce,
					},
					nonceStore,
				);

				// Second request with same nonce fails
				const result = await signer.verify(
					{
						method: "POST",
						path: "/test",
						signature: signed.signature,
						timestamp,
						nonce,
					},
					nonceStore,
				);

				expect(result).toEqual({ valid: false, reason: "nonce_reused" });
			});
		});
	});
});

describe("generateNonce", () => {
	it("generates a hex string of default length", () => {
		const nonce = generateNonce();
		expect(nonce).toMatch(/^[0-9a-f]+$/);
		expect(nonce).toHaveLength(32); // 16 bytes = 32 hex chars
	});

	it("generates a hex string of specified length", () => {
		const nonce = generateNonce(32);
		expect(nonce).toMatch(/^[0-9a-f]+$/);
		expect(nonce).toHaveLength(64); // 32 bytes = 64 hex chars
	});

	it("generates unique nonces", () => {
		const nonces = new Set<string>();
		for (let i = 0; i < 100; i++) {
			nonces.add(generateNonce());
		}
		expect(nonces.size).toBe(100);
	});
});

describe("createInMemoryNonceStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("adds new nonces", async () => {
		const store = createInMemoryNonceStore();

		const result = await store.addIfNotExists("nonce-1", 60000);
		expect(result).toBe(true);
	});

	it("rejects duplicate nonces", async () => {
		const store = createInMemoryNonceStore();

		const result1 = await store.addIfNotExists("nonce-1", 60000);
		const result2 = await store.addIfNotExists("nonce-1", 60000);

		expect(result1).toBe(true);
		expect(result2).toBe(false);
	});

	it("allows reuse of expired nonces", async () => {
		const store = createInMemoryNonceStore();
		const ttl = 1000; // 1 second TTL

		const result1 = await store.addIfNotExists("nonce-1", ttl);
		expect(result1).toBe(true);

		// Advance time past TTL
		vi.advanceTimersByTime(ttl + 100);

		const result2 = await store.addIfNotExists("nonce-1", ttl);
		expect(result2).toBe(true);
	});

	it("cleans up expired nonces periodically", async () => {
		const store = createInMemoryNonceStore();
		const ttl = 1000;

		// Add some nonces
		await store.addIfNotExists("nonce-1", ttl);
		await store.addIfNotExists("nonce-2", ttl);

		// Advance past TTL and cleanup interval
		vi.advanceTimersByTime(70000); // Past 60s cleanup interval

		// Trigger cleanup by adding another nonce
		await store.addIfNotExists("nonce-3", ttl);

		// Old nonces should now be reusable
		const result1 = await store.addIfNotExists("nonce-1", ttl);
		const result2 = await store.addIfNotExists("nonce-2", ttl);

		expect(result1).toBe(true);
		expect(result2).toBe(true);
	});

	it("cleanup method removes expired nonces", async () => {
		const store = createInMemoryNonceStore();
		const ttl = 1000;

		await store.addIfNotExists("nonce-1", ttl);

		// Advance past TTL
		vi.advanceTimersByTime(ttl + 100);

		// Call cleanup
		await store.cleanup?.();

		// Should be able to reuse
		const result = await store.addIfNotExists("nonce-1", ttl);
		expect(result).toBe(true);
	});
});
