import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import type { S3Operations } from "../../../internal/s3-operations.types";
import type { Adapter } from "../../../types/adapter";
import type { StorageContext } from "../../../types/context";
import type { StorageOptions } from "../../../types/options";
import { createMultipartCompleteRoute } from "./complete";

const createMockAdapter = (): Adapter => ({ client: {} }) as unknown as Adapter;

const createMockOperations = (
	overrides?: Partial<S3Operations>,
): S3Operations => ({
	generatePresignedUploadUrl: vi.fn(),
	generatePresignedDownloadUrl: vi.fn(),
	objectExists: vi.fn(),
	deleteObject: vi.fn(),
	createMultipartUpload: vi.fn(),
	presignUploadPart: vi.fn(),
	completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
	abortMultipartUpload: vi.fn(),
	...overrides,
});

const callEndpoint = <T extends (input?: any) => any>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

function createContext() {
	const operations = createMockOperations();
	const options: StorageOptions<z.ZodUndefined> = {
		bucket: "test-bucket",
		adapter: createMockAdapter(),
		metadataSchema: z.undefined(),
	};
	return { options, operations };
}

describe("multipart/complete route", () => {
	it("completes the upload and returns key", async () => {
		const endpoint = createMultipartCompleteRoute();
		const { options, operations } = createContext();

		const result = await callEndpoint(endpoint, {
			body: {
				key: "uploads/file.bin",
				uploadId: "upload-123",
				parts: [
					{ partNumber: 1, eTag: '"etag1"' },
					{ partNumber: 2, eTag: '"etag2"' },
				],
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(result).toEqual({ key: "uploads/file.bin" });
		expect(operations.completeMultipartUpload).toHaveBeenCalledWith({
			key: "uploads/file.bin",
			uploadId: "upload-123",
			parts: [
				{ partNumber: 1, eTag: '"etag1"' },
				{ partNumber: 2, eTag: '"etag2"' },
			],
		});
	});

	it("throws INVALID_PARTS when parts list is empty", async () => {
		const endpoint = createMultipartCompleteRoute();
		const { options, operations } = createContext();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_PARTS,
			message: "Parts list must not be empty.",
			details: { key: "uploads/file.bin", uploadId: "upload-123" },
		});
	});

	it("throws MULTIPART_UPLOAD_NOT_FOUND for NoSuchUpload error", async () => {
		const endpoint = createMultipartCompleteRoute();
		const noSuchUpload = Object.assign(new Error("NoSuchUpload"), {
			name: "NoSuchUpload",
		});
		const { options, operations } = createContext();
		(
			operations.completeMultipartUpload as ReturnType<typeof vi.fn>
		).mockRejectedValue(noSuchUpload);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "expired-id",
					parts: [{ partNumber: 1, eTag: '"etag1"' }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_NOT_FOUND,
			message: "Multipart upload not found or expired.",
		});
	});

	it("throws MULTIPART_UPLOAD_FAILED for other S3 errors", async () => {
		const endpoint = createMultipartCompleteRoute();
		const { options, operations } = createContext();
		(
			operations.completeMultipartUpload as ReturnType<typeof vi.fn>
		).mockRejectedValue(new Error("S3 internal error"));

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1, eTag: '"etag1"' }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
			message: "Failed to complete multipart upload.",
			details: expect.objectContaining({
				error: "S3 internal error",
			}),
		});
	});

	it("re-throws StorageServerError without wrapping", async () => {
		const endpoint = createMultipartCompleteRoute();
		const { options, operations } = createContext();
		const existingError = new StorageServerError({
			code: StorageErrorCode.INVALID_PARTS,
			message: "Parts list must not be empty.",
			details: {},
		});
		(
			operations.completeMultipartUpload as ReturnType<typeof vi.fn>
		).mockRejectedValue(existingError);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1, eTag: '"etag1"' }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toBe(existingError);
	});

	it("rejects invalid object key", async () => {
		const endpoint = createMultipartCompleteRoute();
		const { options, operations } = createContext();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "../escape.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1, eTag: '"etag1"' }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILE_INFO,
		});
	});

	it("throws INTERNAL_SERVER_ERROR when context is missing", async () => {
		const endpoint = createMultipartCompleteRoute();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1, eTag: '"etag1"' }],
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
		});
	});
});
