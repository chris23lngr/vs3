import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../core/error/codes";
import { createBaseClient } from "./create-client";
import * as xhrUploadModule from "./xhr/upload";

// Mock the xhrUpload function
vi.mock("./xhr/upload");

// Mock @better-fetch/fetch
vi.mock("@better-fetch/fetch", () => ({
	createFetch: vi.fn(() => {
		const mockFetch = vi.fn();
		return mockFetch;
	}),
	createSchema: vi.fn(() => ({})),
}));

describe("createBaseClient", () => {
	const mockBaseURL = "http://localhost:3000";
	const mockApiPath = "/api/storage";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("uploadFile", () => {
		it("awaits upload completion before returning", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: null,
				data: {
					key: "uploads/test.txt",
					presignedUrl: "https://s3.example.com/upload",
				},
			});

			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test content"], "test.txt", {
				type: "text/plain",
			});

			const mockUploadResult = {
				uploadUrl: "https://s3.example.com/upload",
				status: 200,
				statusText: "OK",
			};

			const xhrUploadSpy = vi
				.spyOn(xhrUploadModule, "xhrUpload")
				.mockResolvedValue(mockUploadResult);

			const result = await client.uploadFile(mockFile, { userId: "user-1" });

			expect(mockFetchFn).toHaveBeenCalledWith("/upload-url", {
				body: {
					fileInfo: {
						contentType: "text/plain",
						name: "test.txt",
						size: mockFile.size,
					},
					metadata: {
						userId: "user-1",
					},
				},
			});

			// Verify xhrUpload was called and awaited
			expect(xhrUploadSpy).toHaveBeenCalledWith(
				"https://s3.example.com/upload",
				mockFile,
				expect.objectContaining({
					onProgress: undefined,
				}),
			);

			// Verify the result includes upload details
			expect(result).toEqual({
				key: "uploads/test.txt",
				presignedUrl: "https://s3.example.com/upload",
				uploadUrl: mockUploadResult.uploadUrl,
				status: mockUploadResult.status,
				statusText: mockUploadResult.statusText,
			});
		});

		it("surfaces upload errors with structured error type", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: null,
				data: {
					key: "uploads/test.txt",
					presignedUrl: "https://s3.example.com/upload",
				},
			});

			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test content"], "test.txt", {
				type: "text/plain",
			});

			// Mock xhrUpload to reject
			const uploadError = new Error("Network failure");
			vi.spyOn(xhrUploadModule, "xhrUpload").mockRejectedValue(uploadError);

			await expect(
				client.uploadFile(mockFile, { userId: "user-1" }),
			).rejects.toMatchObject({
				code: StorageErrorCode.NETWORK_ERROR,
				message: "Network failure",
			});
		});

		it("surfaces API errors from upload-url request", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: { status: 400, message: "Bad Request" },
				data: null,
			});
			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test content"], "test.txt", {
				type: "text/plain",
			});
			const xhrUploadSpy = vi.spyOn(xhrUploadModule, "xhrUpload");

			await expect(
				client.uploadFile(mockFile, { userId: "user-1" }),
			).rejects.toMatchObject({
				code: StorageErrorCode.UNKNOWN_ERROR,
				message: "Bad Request",
			});
			expect(xhrUploadSpy).not.toHaveBeenCalled();
		});

		it("calls onSuccess after upload completes", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: null,
				data: {
					key: "uploads/test.txt",
					presignedUrl: "https://s3.example.com/upload",
				},
			});

			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test content"], "test.txt", {
				type: "text/plain",
			});

			const mockUploadResult = {
				uploadUrl: "https://s3.example.com/upload",
				status: 200,
				statusText: "OK",
			};

			vi.spyOn(xhrUploadModule, "xhrUpload").mockResolvedValue(mockUploadResult);

			const onSuccessSpy = vi.fn();

			await client.uploadFile(
				mockFile,
				{ userId: "user-1" },
				{ onSuccess: onSuccessSpy },
			);

			expect(onSuccessSpy).toHaveBeenCalledWith({
				key: "uploads/test.txt",
				presignedUrl: "https://s3.example.com/upload",
				uploadUrl: "https://s3.example.com/upload",
				status: 200,
				statusText: "OK",
			});
		});

		it("calls onError when upload fails", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: null,
				data: {
					key: "uploads/test.txt",
					presignedUrl: "https://s3.example.com/upload",
				},
			});

			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test.txt"], "test.txt", {
				type: "text/plain",
			});

			const uploadError = new Error("Upload timeout");
			vi.spyOn(xhrUploadModule, "xhrUpload").mockRejectedValue(uploadError);

			const onErrorSpy = vi.fn();

			await expect(
				client.uploadFile(mockFile, { userId: "user-1" }, { onError: onErrorSpy }),
			).rejects.toThrow();

			expect(onErrorSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					code: StorageErrorCode.NETWORK_ERROR,
					message: "Upload timeout",
				}),
			);
		});

		it("passes onProgress callback to xhrUpload", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const { createFetch } = await import("@better-fetch/fetch");
			const mockFetchFn = vi.fn().mockResolvedValue({
				error: null,
				data: {
					key: "uploads/test.txt",
					presignedUrl: "https://s3.example.com/upload",
				},
			});

			(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

			const client = createBaseClient({
				baseURL: mockBaseURL,
				apiPath: mockApiPath,
				metadataSchema,
			});

			const mockFile = new File(["test content"], "test.txt", {
				type: "text/plain",
			});

			const mockUploadResult = {
				uploadUrl: "https://s3.example.com/upload",
				status: 200,
				statusText: "OK",
			};

			const xhrUploadSpy = vi
				.spyOn(xhrUploadModule, "xhrUpload")
				.mockResolvedValue(mockUploadResult);

			const onProgressSpy = vi.fn();

			await client.uploadFile(
				mockFile,
				{ userId: "user-1" },
				{ onProgress: onProgressSpy },
			);

			expect(xhrUploadSpy).toHaveBeenCalledWith(
				"https://s3.example.com/upload",
				mockFile,
				expect.objectContaining({
					onProgress: onProgressSpy,
				}),
			);
		});

		describe("client-side file size validation", () => {
			it("accepts file within size limit", async () => {
				const metadataSchema = z.object({
					userId: z.string(),
				});

				const { createFetch } = await import("@better-fetch/fetch");
				const mockFetchFn = vi.fn().mockResolvedValue({
					error: null,
					data: {
						key: "uploads/test.txt",
						presignedUrl: "https://s3.example.com/upload",
					},
				});

				(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

				const client = createBaseClient({
					baseURL: mockBaseURL,
					apiPath: mockApiPath,
					metadataSchema,
					maxFileSize: 1000,
				});

				const mockFile = new File(["test"], "test.txt", {
					type: "text/plain",
				});

				const mockUploadResult = {
					uploadUrl: "https://s3.example.com/upload",
					status: 200,
					statusText: "OK",
				};

				vi.spyOn(xhrUploadModule, "xhrUpload").mockResolvedValue(mockUploadResult);

				await expect(
					client.uploadFile(mockFile, { userId: "user-1" }),
				).resolves.toMatchObject({
					key: "uploads/test.txt",
					status: 200,
				});
			});

			it("accepts file exactly at size limit", async () => {
				const metadataSchema = z.object({
					userId: z.string(),
				});

				const { createFetch } = await import("@better-fetch/fetch");
				const mockFetchFn = vi.fn().mockResolvedValue({
					error: null,
					data: {
						key: "uploads/test.txt",
						presignedUrl: "https://s3.example.com/upload",
					},
				});

				(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

				const maxFileSize = 100;
				const client = createBaseClient({
					baseURL: mockBaseURL,
					apiPath: mockApiPath,
					metadataSchema,
					maxFileSize,
				});

				const content = "a".repeat(maxFileSize);
				const mockFile = new File([content], "test.txt", {
					type: "text/plain",
				});

				const mockUploadResult = {
					uploadUrl: "https://s3.example.com/upload",
					status: 200,
					statusText: "OK",
				};

				vi.spyOn(xhrUploadModule, "xhrUpload").mockResolvedValue(mockUploadResult);

				await expect(
					client.uploadFile(mockFile, { userId: "user-1" }),
				).resolves.toMatchObject({
					key: "uploads/test.txt",
					status: 200,
				});
			});

			it("rejects file exceeding size limit before making request", async () => {
				const metadataSchema = z.object({
					userId: z.string(),
				});

				const { createFetch } = await import("@better-fetch/fetch");
				const mockFetchFn = vi.fn();

				(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

				const client = createBaseClient({
					baseURL: mockBaseURL,
					apiPath: mockApiPath,
					metadataSchema,
					maxFileSize: 100,
				});

				const content = "a".repeat(101);
				const mockFile = new File([content], "large.txt", {
					type: "text/plain",
				});

				const xhrUploadSpy = vi.spyOn(xhrUploadModule, "xhrUpload");

				await expect(
					client.uploadFile(mockFile, { userId: "user-1" }),
				).rejects.toMatchObject({
					code: StorageErrorCode.FILE_TOO_LARGE,
					details: {
						fileSize: mockFile.size,
						maxFileSize: 100,
						fileName: "large.txt",
					},
				});

				expect(mockFetchFn).not.toHaveBeenCalled();
				expect(xhrUploadSpy).not.toHaveBeenCalled();
			});

			it("calls onError callback when file exceeds size limit", async () => {
				const metadataSchema = z.object({
					userId: z.string(),
				});

				const { createFetch } = await import("@better-fetch/fetch");
				const mockFetchFn = vi.fn();

				(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

				const client = createBaseClient({
					baseURL: mockBaseURL,
					apiPath: mockApiPath,
					metadataSchema,
					maxFileSize: 50,
				});

				const content = "a".repeat(100);
				const mockFile = new File([content], "large.txt", {
					type: "text/plain",
				});

				const onErrorSpy = vi.fn();

				await expect(
					client.uploadFile(mockFile, { userId: "user-1" }, { onError: onErrorSpy }),
				).rejects.toThrow();

				expect(onErrorSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						code: StorageErrorCode.FILE_TOO_LARGE,
					}),
				);

				expect(mockFetchFn).not.toHaveBeenCalled();
			});

			it("accepts any file size when maxFileSize is not configured", async () => {
				const metadataSchema = z.object({
					userId: z.string(),
				});

				const { createFetch } = await import("@better-fetch/fetch");
				const mockFetchFn = vi.fn().mockResolvedValue({
					error: null,
					data: {
						key: "uploads/huge.txt",
						presignedUrl: "https://s3.example.com/upload",
					},
				});

				(createFetch as ReturnType<typeof vi.fn>).mockReturnValue(mockFetchFn);

				const client = createBaseClient({
					baseURL: mockBaseURL,
					apiPath: mockApiPath,
					metadataSchema,
				});

				const content = "a".repeat(10000000);
				const mockFile = new File([content], "huge.txt", {
					type: "text/plain",
				});

				const mockUploadResult = {
					uploadUrl: "https://s3.example.com/upload",
					status: 200,
					statusText: "OK",
				};

				vi.spyOn(xhrUploadModule, "xhrUpload").mockResolvedValue(mockUploadResult);

				await expect(
					client.uploadFile(mockFile, { userId: "user-1" }),
				).resolves.toMatchObject({
					key: "uploads/huge.txt",
					status: 200,
				});
			});
		});
	});
});
