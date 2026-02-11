import { describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../../core/error/codes";
import { executeMultipartUpload } from "./orchestrator";

function createMockFetch() {
	const responses: Record<string, unknown> = {
		"/multipart/create": { data: { uploadId: "uid-1", key: "uploads/f.bin" } },
		"/multipart/presign-parts": {
			data: {
				parts: [{ partNumber: 1, presignedUrl: "https://s3.example.com/part-1" }],
			},
		},
		"/multipart/complete": { data: { key: "uploads/f.bin" } },
		"/multipart/abort": { data: { success: true } },
	};

	return vi.fn(async (path: string, options?: { body?: unknown }) => {
		const key = path as string;
		if (key === "/multipart/presign-parts" && options?.body) {
			const body = options.body as {
				parts: Array<{ partNumber: number }>;
			};
			return {
				data: {
					parts: body.parts.map((p) => ({
						partNumber: p.partNumber,
						presignedUrl: `https://s3.example.com/part-${p.partNumber}`,
					})),
				},
			};
		}
		return responses[key] ?? { error: { message: "Not found" } };
	}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;
}

// Mock the xhrUploadPart module
vi.mock("../xhr/upload-part", () => ({
	xhrUploadPart: vi.fn(async (params: { partNumber: number }) => ({
		partNumber: params.partNumber,
		eTag: `"etag-${params.partNumber}"`,
	})),
}));

function createSmallFile(size = 100): File {
	const content = new Uint8Array(size).fill(65); // 'A'
	return new File([content], "test.bin", { type: "application/octet-stream" });
}

describe("executeMultipartUpload", () => {
	it("completes a basic multipart upload flow", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(100);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100 },
		});

		expect(result).toEqual({
			key: "uploads/f.bin",
			uploadId: "uid-1",
			totalParts: 1,
		});

		// Should call create, presign, and complete
		expect($fetch).toHaveBeenCalledWith(
			"/multipart/create",
			expect.objectContaining({
				body: expect.objectContaining({
					fileInfo: expect.objectContaining({ name: "test.bin" }),
				}),
			}),
		);
		expect($fetch).toHaveBeenCalledWith(
			"/multipart/presign-parts",
			expect.any(Object),
		);
		expect($fetch).toHaveBeenCalledWith(
			"/multipart/complete",
			expect.any(Object),
		);
	});

	it("splits file into multiple parts", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(250);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100 },
		});

		expect(result.totalParts).toBe(3); // 250 / 100 = 2.5, rounds up to 3 parts
	});

	it("reports progress via onProgress callback", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(100);
		const onProgress = vi.fn();
		const uploadPartModule = await import("../xhr/upload-part");
		const uploadPartMock = vi.mocked(uploadPartModule.xhrUploadPart);
		uploadPartMock.mockImplementationOnce(
			async (params: {
				partNumber: number;
				onProgress?: (loaded: number) => void;
			}) => {
				params.onProgress?.(50);
				return {
					partNumber: params.partNumber,
					eTag: `"etag-${params.partNumber}"`,
				};
			},
		);

		await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100, onProgress },
		});

		expect(onProgress).toHaveBeenCalledWith(0.5);
	});

	it("aborts upload on create failure", async () => {
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return { error: { message: "Create failed" } };
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Failed to create multipart upload",
		});
	});

	it("aborts upload on presign failure and calls abort endpoint", async () => {
		let abortCalled = false;
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return { data: { uploadId: "uid-1", key: "k" } };
			}
			if (path === "/multipart/presign-parts") {
				return { error: { message: "Presign failed" } };
			}
			if (path === "/multipart/abort") {
				abortCalled = true;
				return { data: { success: true } };
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: { partSize: 100 },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Failed to presign upload parts",
		});

		expect(abortCalled).toBe(true);
	});

	it("aborts upload on complete failure", async () => {
		let abortCalled = false;
		const $fetch = vi.fn(async (path: string, opts?: { body?: unknown }) => {
			if (path === "/multipart/create") {
				return { data: { uploadId: "uid-1", key: "k" } };
			}
			if (path === "/multipart/presign-parts") {
				const body = opts?.body as { parts: Array<{ partNumber: number }> };
				return {
					data: {
						parts: body.parts.map((p) => ({
							partNumber: p.partNumber,
							presignedUrl: `https://s3.example.com/part-${p.partNumber}`,
						})),
					},
				};
			}
			if (path === "/multipart/complete") {
				return { error: { message: "Complete failed" } };
			}
			if (path === "/multipart/abort") {
				abortCalled = true;
				return { data: { success: true } };
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: { partSize: 100 },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Failed to complete multipart upload",
		});

		expect(abortCalled).toBe(true);
	});

	it("passes encryption to create body", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(100);

		await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: {
				partSize: 100,
				encryption: { type: "SSE-S3" },
			},
		});

		expect($fetch).toHaveBeenCalledWith(
			"/multipart/create",
			expect.objectContaining({
				body: expect.objectContaining({
					encryption: { type: "SSE-S3" },
				}),
			}),
		);
	});

	it("passes encryption to presign-parts and forwards part upload headers", async () => {
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return { data: { uploadId: "uid-1", key: "uploads/f.bin" } };
			}
			if (path === "/multipart/presign-parts") {
				return {
					data: {
						parts: [
							{
								partNumber: 1,
								presignedUrl: "https://s3.example.com/part-1",
								uploadHeaders: {
									"x-amz-server-side-encryption-customer-algorithm": "AES256",
									"x-amz-server-side-encryption-customer-key": "base64-key",
									"x-amz-server-side-encryption-customer-key-MD5": "base64-md5",
								},
							},
						],
					},
				};
			}
			if (path === "/multipart/complete") {
				return { data: { key: "uploads/f.bin" } };
			}
			if (path === "/multipart/abort") {
				return { data: { success: true } };
			}
			return { error: { message: "Unexpected path" } };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;
		const file = createSmallFile(100);
		const uploadPartModule = await import("../xhr/upload-part");
		const uploadPartMock = vi.mocked(uploadPartModule.xhrUploadPart);
		uploadPartMock.mockResolvedValue({
			partNumber: 1,
			eTag: '"etag-1"',
		});

		await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: {
				partSize: 100,
				encryption: {
					type: "SSE-C",
					customerKey: "dGVzdC1rZXktYmFzZTY0",
				},
			},
		});

		expect($fetch).toHaveBeenCalledWith(
			"/multipart/presign-parts",
			expect.objectContaining({
				body: expect.objectContaining({
					encryption: {
						type: "SSE-C",
						customerKey: "dGVzdC1rZXktYmFzZTY0",
					},
				}),
			}),
		);

		expect(uploadPartMock).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: {
					"x-amz-server-side-encryption-customer-algorithm": "AES256",
					"x-amz-server-side-encryption-customer-key": "base64-key",
					"x-amz-server-side-encryption-customer-key-MD5": "base64-md5",
				},
			}),
			expect.any(Object),
		);
	});

	it("uses default partSize and concurrency when not specified", async () => {
		const $fetch = createMockFetch();
		// Use a small file to verify default part size/concurrency behavior.
		const file = createSmallFile(100);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: {},
		});

		// With default 10MB part size, a 100-byte file should have 1 part
		expect(result.totalParts).toBe(1);
	});

	it("forwards AbortSignal to create, presign, and complete requests", async () => {
		const $fetch = createMockFetch();
		const signal = new AbortController().signal;

		await executeMultipartUpload({
			$fetch,
			file: createSmallFile(),
			metadata: {},
			options: { partSize: 100, signal },
		});

		expect($fetch).toHaveBeenCalledWith(
			"/multipart/create",
			expect.objectContaining({ signal }),
		);
		expect($fetch).toHaveBeenCalledWith(
			"/multipart/presign-parts",
			expect.objectContaining({ signal }),
		);
		expect($fetch).toHaveBeenCalledWith(
			"/multipart/complete",
			expect.objectContaining({ signal }),
		);
	});

	it("rejects invalid partSize values", async () => {
		const $fetch = createMockFetch();

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: { partSize: 0 },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid multipart partSize.",
		});
	});

	it("rejects invalid concurrency values", async () => {
		const $fetch = createMockFetch();

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: { concurrency: 0 },
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid multipart concurrency.",
		});
	});

	it("rejects empty files for multipart uploads", async () => {
		const $fetch = createMockFetch();

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(0),
				metadata: {},
				options: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Multipart upload requires a non-empty file.",
		});
	});

	it("preserves typed server errors from create", async () => {
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return {
					error: {
						origin: "server",
						code: StorageErrorCode.METADATA_VALIDATION_ERROR,
						message: "Invalid metadata.",
						details: { field: "userId" },
						httpStatus: 400,
					},
				};
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.METADATA_VALIDATION_ERROR,
			message: "Invalid metadata.",
		});
	});

	it("rejects invalid multipart/create response payloads", async () => {
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return { data: { uploadId: "", key: "" } };
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid multipart create response.",
		});
	});

	it("rejects invalid multipart/presign-parts response payloads", async () => {
		let abortCalled = false;
		const $fetch = vi.fn(async (path: string) => {
			if (path === "/multipart/create") {
				return { data: { uploadId: "uid-1", key: "uploads/f.bin" } };
			}
			if (path === "/multipart/presign-parts") {
				return { data: { parts: [{ partNumber: 0, presignedUrl: "" }] } };
			}
			if (path === "/multipart/abort") {
				abortCalled = true;
				return { data: { success: true } };
			}
			return { data: {} };
		}) as unknown as ReturnType<typeof import("@better-fetch/fetch").createFetch>;

		await expect(
			executeMultipartUpload({
				$fetch,
				file: createSmallFile(),
				metadata: {},
				options: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid multipart presign response.",
		});
		expect(abortCalled).toBe(true);
	});
});

describe("splitFileIntoParts (via orchestrator)", () => {
	it("creates correct number of parts for exact division", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(300);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100 },
		});

		expect(result.totalParts).toBe(3);
	});

	it("creates extra part for remainder", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(350);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100 },
		});

		expect(result.totalParts).toBe(4);
	});

	it("handles single-part file", async () => {
		const $fetch = createMockFetch();
		const file = createSmallFile(50);

		const result = await executeMultipartUpload({
			$fetch,
			file,
			metadata: {},
			options: { partSize: 100 },
		});

		expect(result.totalParts).toBe(1);
	});
});
