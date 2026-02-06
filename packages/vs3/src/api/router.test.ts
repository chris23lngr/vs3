import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { createContext } from "../context/create-context";
import { createStorageMiddleware } from "../middleware";
import type { Adapter } from "../types/adapter";
import { router } from "./router";

const createAdapter = (): Adapter => ({
	generatePresignedUploadUrl: vi
		.fn<Adapter["generatePresignedUploadUrl"]>()
		.mockResolvedValue("https://example.com/upload"),
	generatePresignedDownloadUrl: vi
		.fn<Adapter["generatePresignedDownloadUrl"]>()
		.mockResolvedValue("https://example.com/download"),
	objectExists: vi.fn<Adapter["objectExists"]>().mockResolvedValue(true),
	deleteObject: vi.fn<Adapter["deleteObject"]>().mockResolvedValue(undefined),
});

describe("router", () => {
	it("handles upload-url requests end-to-end", async () => {
		const adapter = createAdapter();
		const options = {
			bucket: "test-bucket",
			adapter,
			metadataSchema: z.object({
				userId: z.string(),
			}),
			generateKey: vi.fn().mockResolvedValue("uploads/user-1.png"),
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/upload-url", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				fileInfo: {
					name: "user-1.png",
					size: 123,
					contentType: "image/png",
				},
				metadata: {
					userId: "user-1",
				},
			}),
		});

		const response = await handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			presignedUrl: "https://example.com/upload",
			key: "uploads/user-1.png",
		});
	});

	it("returns validation errors for invalid metadata", async () => {
		const adapter = createAdapter();
		const options = {
			bucket: "test-bucket",
			adapter,
			metadataSchema: z.object({
				userId: z.string().min(3),
			}),
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/upload-url", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				fileInfo: {
					name: "user-1.png",
					size: 123,
					contentType: "image/png",
				},
				metadata: {
					userId: "x",
				},
			}),
		});

		const response = await handler(request);

		expect(response.status).toBe(400);
	});

	it("reliably injects context with $options for all requests", async () => {
		const adapter = createAdapter();
		const options = {
			bucket: "context-test-bucket",
			adapter,
			metadataSchema: z.object({
				userId: z.string(),
			}),
			generateKey: vi.fn().mockResolvedValue("test-key.png"),
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/upload-url", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				fileInfo: {
					name: "test.png",
					size: 100,
					contentType: "image/png",
				},
				metadata: {
					userId: "test-user",
				},
			}),
		});

		const response = await handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toHaveProperty("presignedUrl");
		expect(data).toHaveProperty("key");
		// Verify the adapter was called (which means context was available)
		expect(adapter.generatePresignedUploadUrl).toHaveBeenCalled();
	});

	it("executes middlewares via the HTTP handler path", async () => {
		const middlewareHandler = vi.fn().mockResolvedValue({ verified: true });
		const middleware = createStorageMiddleware(
			{ name: "http-test" },
			middlewareHandler,
		);

		const adapter = createAdapter();
		const options = {
			bucket: "test-bucket",
			adapter,
			metadataSchema: z.object({
				userId: z.string(),
			}),
			generateKey: vi.fn().mockResolvedValue("test-key.png"),
			middlewares: [middleware],
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/upload-url", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				fileInfo: {
					name: "test.png",
					size: 100,
					contentType: "image/png",
				},
				metadata: { userId: "user-1" },
			}),
		});

		const response = await handler(request);

		expect(response.status).toBe(200);
		expect(middlewareHandler).toHaveBeenCalledTimes(1);
		expect(middlewareHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/upload-url",
			}),
		);
	});

	it("handles download-url requests end-to-end", async () => {
		const adapter = createAdapter();
		const options = {
			bucket: "test-bucket",
			adapter,
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/download-url", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				key: "uploads/photo.png",
			}),
		});

		const response = await handler(request);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			presignedUrl: "https://example.com/download",
		});
	});

	it("rejects requests when middleware throws via HTTP handler", async () => {
		const middleware = createStorageMiddleware({ name: "blocker" }, async () => {
			throw new Error("unauthorized");
		});

		const adapter = createAdapter();
		const options = {
			bucket: "test-bucket",
			adapter,
			middlewares: [middleware],
		};
		const context = createContext(options);
		const { handler } = router(options, context);

		const request = new Request("http://localhost/upload-url", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				fileInfo: {
					name: "test.png",
					size: 100,
					contentType: "image/png",
				},
			}),
		});

		const response = await handler(request);

		expect(response.status).toBeGreaterThanOrEqual(400);
	});
});
