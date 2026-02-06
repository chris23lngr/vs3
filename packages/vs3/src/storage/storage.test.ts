import { describe, expect, expectTypeOf, it, vi } from "vitest";
import z from "zod";
import { createStorageMiddleware } from "../middleware";
import type { Adapter } from "../types/adapter";
import { createStorage } from "./create-storage";

describe("storage", () => {
	const createAdapter = (): Adapter => ({
		generatePresignedUploadUrl: vi
			.fn<Adapter["generatePresignedUploadUrl"]>()
			.mockResolvedValue("https://example.com/upload"),
		generatePresignedDownloadUrl: vi
			.fn<Adapter["generatePresignedDownloadUrl"]>()
			.mockResolvedValue("https://example.com/download"),
		deleteObject: vi.fn<Adapter["deleteObject"]>().mockResolvedValue(undefined),
	});

	const callUploadUrl = <T extends (input?: any) => any>(
		fn: T,
		input: unknown,
	) => fn(input as Parameters<T>[0]);

	it("creates a storage instance with api + handler", () => {
		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
		});

		expect(storage).toBeDefined();
		expect(storage.api).toBeDefined();
		expect(storage.handler).toBeDefined();
		expectTypeOf(storage.handler).toBeFunction();
	});

	it("exposes typed metadata schema on $Infer", () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
			metadataSchema,
		});

		expect(storage.$Infer).toBeDefined();
		// @ts-expect-error TODO: Fix this
		expectTypeOf(storage.$Infer.metadata).toBeAny();
	});

	it("generates an upload url and passes metadata to generateKey", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const generateKey = vi.fn().mockResolvedValue("uploads/user-1/photo.png");

		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
			metadataSchema,
			generateKey,
		});

		const result = await storage.api.uploadUrl({
			body: {
				fileInfo: {
					name: "photo.png",
					size: 123,
					contentType: "image/png",
				},
				metadata: {
					userId: "user-1",
				},
			},
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/upload",
			key: "uploads/user-1/photo.png",
		});
		expect(generateKey).toHaveBeenCalledWith(
			{
				name: "photo.png",
				size: 123,
				contentType: "image/png",
			},
			{ userId: "user-1" },
		);
	});

	it("injects bucket into adapter calls by default", async () => {
		const adapter = createAdapter();

		const storage = createStorage({
			bucket: "test-bucket",
			adapter,
		});

		await callUploadUrl(storage.api.uploadUrl, {
			body: {
				fileInfo: {
					name: "photo.png",
					size: 123,
					contentType: "image/png",
				},
			},
		});

		expect(adapter.generatePresignedUploadUrl).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				name: "photo.png",
			}),
			expect.objectContaining({
				bucket: "test-bucket",
			}),
		);
	});

	it("executes global middlewares when calling api.uploadUrl", async () => {
		const handler = vi.fn().mockResolvedValue({ verified: true });

		const middleware = createStorageMiddleware(
			{ name: "test-middleware" },
			handler,
		);

		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
			middlewares: [middleware],
		});

		await callUploadUrl(storage.api.uploadUrl, {
			body: {
				fileInfo: {
					name: "photo.png",
					size: 123,
					contentType: "image/png",
				},
			},
		});

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/upload-url",
				method: "POST",
			}),
		);
	});

	it("middleware errors propagate to the caller", async () => {
		const middleware = createStorageMiddleware(
			{ name: "failing-middleware" },
			async () => {
				throw new Error("auth failed");
			},
		);

		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
			middlewares: [middleware],
		});

		await expect(
			callUploadUrl(storage.api.uploadUrl, {
				body: {
					fileInfo: {
						name: "photo.png",
						size: 123,
						contentType: "image/png",
					},
				},
			}),
		).rejects.toThrow("failing-middleware");
	});

	it("runs multiple middlewares in order", async () => {
		const order: string[] = [];

		const first = createStorageMiddleware({ name: "first" }, async () => {
			order.push("first");
			return { step: 1 };
		});

		const second = createStorageMiddleware({ name: "second" }, async () => {
			order.push("second");
			return { step: 2 };
		});

		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
			middlewares: [first, second],
		});

		await callUploadUrl(storage.api.uploadUrl, {
			body: {
				fileInfo: {
					name: "photo.png",
					size: 123,
					contentType: "image/png",
				},
			},
		});

		expect(order).toEqual(["first", "second"]);
	});

	it("works without middlewares (default behavior)", async () => {
		const storage = createStorage({
			bucket: "test",
			adapter: createAdapter(),
		});

		const result = await callUploadUrl(storage.api.uploadUrl, {
			body: {
				fileInfo: {
					name: "photo.png",
					size: 123,
					contentType: "image/png",
				},
			},
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/upload",
			key: expect.any(String),
		});
	});
});
