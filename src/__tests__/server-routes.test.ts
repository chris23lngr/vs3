import { describe, expect, it, vi } from "vitest";
import { createStorage } from "../storage";
import type { StandardSchemaV1 } from "../types/standard-schema";

describe("server routes", () => {
	it("rejects files larger than maxFileSize", async () => {
		const adapter = {
			generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://upload"),
			generatePresignedDownloadUrl: vi.fn().mockResolvedValue("https://download"),
			deleteObject: vi.fn(),
		};

		const storage = createStorage({
			bucket: "test",
			adapter,
			maxFileSize: 1,
		});

		await expect(
			storage.api.upload({
				body: {
					file: { name: "a.txt", size: 2, contentType: "text/plain" },
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
			body: { error: { code: "FILE_TOO_LARGE" } },
		});
	});

	it("rejects files with disallowed type", async () => {
		const adapter = {
			generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://upload"),
			generatePresignedDownloadUrl: vi.fn().mockResolvedValue("https://download"),
			deleteObject: vi.fn(),
		};

		const storage = createStorage({
			bucket: "test",
			adapter,
			allowedFileTypes: ["image/png"],
		});

		await expect(
			storage.api.upload({
				body: {
					file: { name: "a.txt", size: 1, contentType: "text/plain" },
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
			body: { error: { code: "FILE_TYPE_NOT_ALLOWED" } },
		});
	});

	it("uses metadata output for generateKey and hooks", async () => {
		const adapter = {
			generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://upload"),
			generatePresignedDownloadUrl: vi.fn().mockResolvedValue("https://download"),
			deleteObject: vi.fn(),
		};

		const metadataSchema: StandardSchemaV1<
			{ userId: string },
			{ userId: number }
		> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: (value) => {
					if (!value || typeof value !== "object" || !("userId" in value)) {
						return { issues: [{ message: "userId required" }] };
					}
					const parsed = Number((value as any).userId);
					return { value: { userId: parsed } };
				},
				types: {
					input: { userId: "" },
					output: { userId: 0 },
				},
			},
		};

		const beforeUpload = vi.fn().mockResolvedValue({ success: true });
		const storage = createStorage({
			bucket: "test",
			adapter,
			metadataSchema,
			generateKey: (_file, metadata) => `user-${metadata.userId}`,
			hooks: { beforeUpload },
		});

		const result = await storage.api.upload({
			body: {
				file: { name: "a.txt", size: 1, contentType: "text/plain" },
				metadata: { userId: "42" },
			},
		});

		expect(result.uploadUrl).toBe("https://upload");
		expect(adapter.generatePresignedUploadUrl).toHaveBeenCalledWith(
			"user-42",
			{ name: "a.txt", size: 1, contentType: "text/plain" },
			expect.anything(),
		);
		expect(beforeUpload).toHaveBeenCalledWith(
			{ name: "a.txt", size: 1, contentType: "text/plain" },
			{ userId: 42 },
		);
	});

	it("rejects upload when beforeUpload fails", async () => {
		const adapter = {
			generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://upload"),
			generatePresignedDownloadUrl: vi.fn().mockResolvedValue("https://download"),
			deleteObject: vi.fn(),
		};

		const storage = createStorage({
			bucket: "test",
			adapter,
			hooks: {
				beforeUpload: async () => ({ success: false, reason: "nope" }),
			},
		});

		await expect(
			storage.api.upload({
				body: {
					file: { name: "a.txt", size: 1, contentType: "text/plain" },
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 403,
			body: { error: { code: "BEFORE_UPLOAD_REJECTED" } },
		});
	});

	it("deletes files via adapter", async () => {
		const adapter = {
			generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://upload"),
			generatePresignedDownloadUrl: vi.fn().mockResolvedValue("https://download"),
			deleteObject: vi.fn().mockResolvedValue(undefined),
		};

		const storage = createStorage({
			bucket: "test",
			adapter,
		});

		const result = await storage.api.delete({
			body: {
				key: "file.txt",
			},
		});

		expect(result.success).toBe(true);
		expect(adapter.deleteObject).toHaveBeenCalledWith("file.txt", {
			bucket: "test",
		});
	});
});
