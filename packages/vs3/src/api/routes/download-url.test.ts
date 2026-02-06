import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type { Adapter } from "../../types/adapter";
import type { StorageOptions } from "../../types/options";
import { createDownloadUrlRoute } from "./download-url";

const createAdapter = (): Adapter => ({
	generatePresignedUploadUrl: vi.fn(),
	generatePresignedDownloadUrl: vi
		.fn<Adapter["generatePresignedDownloadUrl"]>()
		.mockResolvedValue("https://example.com/download"),
	objectExists: vi.fn<Adapter["objectExists"]>().mockResolvedValue(true),
	deleteObject: vi.fn(),
});

const createContextOptions = (
	overrides: Partial<StorageOptions> = {},
): StorageOptions => ({
	bucket: "test-bucket",
	adapter: createAdapter(),
	...overrides,
});

const callEndpoint = <T extends (input?: any) => any>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

describe("download-url route", () => {
	it("returns a presigned URL for a valid key", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();

		const result = await callEndpoint(endpoint, {
			body: { key: "uploads/photo.png" },
			context: { $options: contextOptions },
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/download",
		});
	});

	it("passes expiresIn and encryption to adapter", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		const adapter = contextOptions.adapter;

		await callEndpoint(endpoint, {
			body: {
				key: "uploads/photo.png",
				expiresIn: 300,
				encryption: { type: "SSE-S3" },
			},
			context: { $options: contextOptions },
		});

		expect(adapter.generatePresignedDownloadUrl).toHaveBeenCalledWith(
			"uploads/photo.png",
			expect.objectContaining({
				expiresIn: 300,
				encryption: { type: "SSE-S3" },
			}),
		);
	});

	it("returns downloadHeaders when adapter provides them", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		contextOptions.adapter.generatePresignedDownloadUrl = vi
			.fn()
			.mockResolvedValue({
				url: "https://example.com/download",
				headers: {
					"x-amz-server-side-encryption": "AES256",
				},
			});

		const result = await callEndpoint(endpoint, {
			body: { key: "uploads/photo.png" },
			context: { $options: contextOptions },
		});

		expect(result).toMatchObject({
			presignedUrl: "https://example.com/download",
			downloadHeaders: {
				"x-amz-server-side-encryption": "AES256",
			},
		});
	});

	it("throws INTERNAL_SERVER_ERROR when context is missing", async () => {
		const endpoint = createDownloadUrlRoute();

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/photo.png" },
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Storage context is not available.",
		});
	});

	it("throws FORBIDDEN when beforeDownload hook rejects", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions({
			hooks: {
				beforeDownload: vi
					.fn()
					.mockResolvedValue({ success: false, reason: "Not allowed" }),
			},
		});

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/private.png" },
				context: { $options: contextOptions },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.FORBIDDEN,
			message: "Not allowed",
		});
	});

	it("calls afterDownload hook after success", async () => {
		const afterDownload = vi.fn().mockResolvedValue(undefined);
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions({
			hooks: { afterDownload },
		});

		await callEndpoint(endpoint, {
			body: { key: "uploads/photo.png" },
			context: { $options: contextOptions },
		});

		expect(afterDownload).toHaveBeenCalledWith("uploads/photo.png");
	});

	it("works without any hooks configured", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();

		const result = await callEndpoint(endpoint, {
			body: { key: "uploads/photo.png" },
			context: { $options: contextOptions },
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/download",
		});
	});

	it("rejects keys with path traversal", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();

		await expect(
			callEndpoint(endpoint, {
				body: { key: "../../../etc/passwd" },
				context: { $options: contextOptions },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid object key.",
		});
	});

	it("propagates afterDownload hook errors", async () => {
		const afterDownload = vi.fn().mockRejectedValue(new Error("hook failed"));
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions({
			hooks: { afterDownload },
		});

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/photo.png" },
				context: { $options: contextOptions },
			}),
		).rejects.toThrow("hook failed");
	});

	it("bubbles adapter errors", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		contextOptions.adapter.generatePresignedDownloadUrl = vi.fn(() => {
			throw new StorageServerError({
				code: StorageErrorCode.INTERNAL_SERVER_ERROR,
				message: "Adapter error",
				details: "fail",
			});
		});

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/photo.png" },
				context: { $options: contextOptions },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Adapter error",
		});
	});

	it("throws NOT_FOUND when object does not exist", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		(
			contextOptions.adapter.objectExists as ReturnType<typeof vi.fn>
		).mockResolvedValue(false);

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/missing.png" },
				context: { $options: contextOptions },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.NOT_FOUND,
			message: "Object not found.",
		});
	});

	it("does not call generatePresignedDownloadUrl when object is missing", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		(
			contextOptions.adapter.objectExists as ReturnType<typeof vi.fn>
		).mockResolvedValue(false);

		try {
			await callEndpoint(endpoint, {
				body: { key: "uploads/missing.png" },
				context: { $options: contextOptions },
			});
		} catch {
			// expected
		}

		expect(
			contextOptions.adapter.generatePresignedDownloadUrl,
		).not.toHaveBeenCalled();
	});

	it("propagates objectExists adapter errors", async () => {
		const endpoint = createDownloadUrlRoute();
		const contextOptions = createContextOptions();
		(
			contextOptions.adapter.objectExists as ReturnType<typeof vi.fn>
		).mockRejectedValue(new Error("S3 service error"));

		await expect(
			callEndpoint(endpoint, {
				body: { key: "uploads/photo.png" },
				context: { $options: contextOptions },
			}),
		).rejects.toThrow("S3 service error");
	});

	it("works with metadata schema provided but not required", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createDownloadUrlRoute(metadataSchema);
		const contextOptions = createContextOptions({ metadataSchema });

		const result = await callEndpoint(endpoint, {
			body: { key: "uploads/photo.png" },
			context: { $options: contextOptions },
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/download",
		});
	});
});
