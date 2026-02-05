import { describe, expect, it, vi } from "vitest";
import z from "zod";
import type { Adapter } from "../types/adapter";
import { createContext } from "../context/create-context";
import { router } from "./router";

const createAdapter = (): Adapter => ({
	generatePresignedUploadUrl: vi
		.fn<Adapter["generatePresignedUploadUrl"]>()
		.mockResolvedValue("https://example.com/upload"),
	generatePresignedDownloadUrl: vi
		.fn<Adapter["generatePresignedDownloadUrl"]>()
		.mockResolvedValue("https://example.com/download"),
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
});
