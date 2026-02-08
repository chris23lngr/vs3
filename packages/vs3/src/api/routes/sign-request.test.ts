import { describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import type { S3Operations } from "../../internal/s3-operations.types";
import type { Adapter } from "../../types/adapter";
import type { StorageContext } from "../../types/context";
import type { StorageOptions } from "../../types/options";
import { createSignRequestRoute } from "./sign-request";

const createMockAdapter = (): Adapter => ({ client: {} }) as unknown as Adapter;

const createMockOperations = (): S3Operations =>
	({
		generatePresignedUploadUrl: vi.fn(),
		generatePresignedDownloadUrl: vi.fn(),
		objectExists: vi.fn(),
		deleteObject: vi.fn(),
	}) as unknown as S3Operations;

/**
 * Typed input shape for the sign-request endpoint.
 * Mirrors the context injected by toStorageEndpoints at runtime.
 */
type SignRequestTestInput = {
	body: { method: string; path: string; body?: string };
	request?: Request;
	context: Omit<StorageContext, "$middleware">;
};

/**
 * Calls the endpoint with a typed input. The cast via `unknown` is required
 * because better-call's StrictEndpoint signature is opaque, but the input
 * shape is verified by SignRequestTestInput at the call site.
 */
function callEndpoint(
	endpoint: ReturnType<typeof createSignRequestRoute>,
	input: SignRequestTestInput,
): Promise<{ headers: Record<string, string> }> {
	return (
		endpoint as (input: unknown) => Promise<{ headers: Record<string, string> }>
	)(input);
}

/**
 * Calls the endpoint with deliberately malformed input to test runtime
 * guards that protect against plain-JS callers bypassing TypeScript.
 */
function callEndpointUnsafe(
	endpoint: ReturnType<typeof createSignRequestRoute>,
	input: Record<string, unknown>,
): Promise<unknown> {
	return (endpoint as (input: unknown) => Promise<unknown>)(input);
}

describe("sign-request route", () => {
	const testSecret = "sign-request-secret";

	it("returns signature headers and nonce when required", async () => {
		const endpoint = createSignRequestRoute();
		const { options, operations } = {
			options: {
				bucket: "test-bucket",
				adapter: createMockAdapter(),
				signature: {
					secret: testSecret,
					requireNonce: true,
					authHook: vi.fn().mockResolvedValue({ authenticated: true }),
				},
			} satisfies StorageOptions,
			operations: createMockOperations(),
		};

		const request = new Request("http://localhost/sign-request", {
			method: "POST",
			headers: {
				authorization: "Bearer token",
			},
		});

		const result = await callEndpoint(endpoint, {
			body: {
				method: "POST",
				path: "/upload-url",
				body: JSON.stringify({ test: true }),
			},
			request,
			context: {
				$options: options,
				$operations: operations,
			},
		});

		expect(result.headers["x-signature"]).toBeDefined();
		expect(result.headers["x-timestamp"]).toBeDefined();
		expect(result.headers["x-nonce"]).toBeDefined();
	});

	it("throws UNAUTHORIZED when authHook rejects", async () => {
		const endpoint = createSignRequestRoute();
		const { options, operations } = {
			options: {
				bucket: "test-bucket",
				adapter: createMockAdapter(),
				signature: {
					secret: testSecret,
					authHook: vi
						.fn()
						.mockResolvedValue({ authenticated: false, reason: "nope" }),
				},
			} satisfies StorageOptions,
			operations: createMockOperations(),
		};

		const request = new Request("http://localhost/sign-request", {
			method: "POST",
			headers: {
				authorization: "Bearer token",
			},
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					method: "POST",
					path: "/upload-url",
				},
				request,
				context: {
					$options: options,
					$operations: operations,
				},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNAUTHORIZED,
		});
	});

	it("throws INTERNAL_SERVER_ERROR when signature config is missing", async () => {
		const endpoint = createSignRequestRoute();
		const options: StorageOptions = {
			bucket: "test-bucket",
			adapter: createMockAdapter(),
		};
		const operations = createMockOperations();

		await expect(
			callEndpoint(endpoint, {
				body: {
					method: "POST",
					path: "/upload-url",
				},
				context: {
					$options: options,
					$operations: operations,
				},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Signature configuration is not available.",
		});
	});

	// Defense-in-depth: tests runtime guard for plain-JS callers that bypass TypeScript.
	// Uses callEndpointUnsafe because the input deliberately violates the type contract.
	it("throws INTERNAL_SERVER_ERROR when authHook is missing", async () => {
		const endpoint = createSignRequestRoute();
		const operations = createMockOperations();

		await expect(
			callEndpointUnsafe(endpoint, {
				body: {
					method: "POST",
					path: "/upload-url",
				},
				context: {
					$options: {
						bucket: "test-bucket",
						adapter: createMockAdapter(),
						signature: { secret: testSecret },
					},
					$operations: operations,
				},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "An authHook is required for the /sign-request route.",
		});
	});

	// Defense-in-depth: tests runtime guard for plain-JS callers that bypass TypeScript.
	it("throws INTERNAL_SERVER_ERROR when context is missing", async () => {
		const endpoint = createSignRequestRoute();

		await expect(
			callEndpointUnsafe(endpoint, {
				body: {
					method: "POST",
					path: "/upload-url",
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Storage context is not available.",
		});
	});
});
