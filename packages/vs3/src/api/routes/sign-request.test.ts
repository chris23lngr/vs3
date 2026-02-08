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

const callEndpoint = <T extends (input?: unknown) => unknown>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

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
			} satisfies Omit<StorageContext, "$middleware">,
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
				} satisfies Omit<StorageContext, "$middleware">,
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
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Signature configuration is not available.",
		});
	});

	it("throws INTERNAL_SERVER_ERROR when context is missing", async () => {
		const endpoint = createSignRequestRoute();

		await expect(
			callEndpoint(endpoint, {
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
