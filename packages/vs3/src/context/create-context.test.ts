import { describe, expect, it, vi } from "vitest";
import type { Adapter } from "../types/adapter";
import { createContext } from "./create-context";

const fileInfo = {
	name: "photo.png",
	size: 123,
	contentType: "image/png",
};

const createAdapter = (): Adapter => ({
	generatePresignedUploadUrl: vi
		.fn<Adapter["generatePresignedUploadUrl"]>()
		.mockResolvedValue("https://example.com/upload"),
	generatePresignedDownloadUrl: vi
		.fn<Adapter["generatePresignedDownloadUrl"]>()
		.mockResolvedValue("https://example.com/download"),
	deleteObject: vi.fn<Adapter["deleteObject"]>().mockResolvedValue(undefined),
});

describe("createContext", () => {
	it("injects the default bucket when none is provided (upload)", async () => {
		const adapter = createAdapter();
		const ctx = createContext({
			bucket: "bucket-a",
			adapter,
		});

		await ctx.$options.adapter.generatePresignedUploadUrl("key", fileInfo, {
			contentType: "image/png",
		});

		expect(adapter.generatePresignedUploadUrl).toHaveBeenCalledWith(
			"key",
			fileInfo,
			expect.objectContaining({
				contentType: "image/png",
				bucket: "bucket-a",
			}),
		);
	});

	it("respects explicit bucket overrides (upload)", async () => {
		const adapter = createAdapter();
		const ctx = createContext({
			bucket: "bucket-a",
			adapter,
		});

		await ctx.$options.adapter.generatePresignedUploadUrl("key", fileInfo, {
			bucket: "bucket-b",
			expiresIn: 60,
		});

		expect(adapter.generatePresignedUploadUrl).toHaveBeenCalledWith(
			"key",
			fileInfo,
			expect.objectContaining({
				expiresIn: 60,
				bucket: "bucket-b",
			}),
		);
	});

	it("injects bucket for download urls", async () => {
		const adapter = createAdapter();
		const ctx = createContext({
			bucket: "bucket-a",
			adapter,
		});

		await ctx.$options.adapter.generatePresignedDownloadUrl("key");

		expect(adapter.generatePresignedDownloadUrl).toHaveBeenCalledWith(
			"key",
			expect.objectContaining({
				bucket: "bucket-a",
			}),
		);
	});

	it("injects bucket for deletes", async () => {
		const adapter = createAdapter();
		const ctx = createContext({
			bucket: "bucket-a",
			adapter,
		});

		await ctx.$options.adapter.deleteObject("key");

		expect(adapter.deleteObject).toHaveBeenCalledWith(
			"key",
			expect.objectContaining({
				bucket: "bucket-a",
			}),
		);
	});

	it("preserves other storage options on $options", () => {
		const adapter = createAdapter();
		const ctx = createContext({
			bucket: "bucket-a",
			adapter,
			maxFileSize: 10,
			allowedFileTypes: ["image/png"],
			baseUrl: "https://example.com",
		});

		expect(ctx.$options.bucket).toBe("bucket-a");
		expect(ctx.$options.maxFileSize).toBe(10);
		expect(ctx.$options.allowedFileTypes).toEqual(["image/png"]);
		expect(ctx.$options.baseUrl).toBe("https://example.com");
	});
});
