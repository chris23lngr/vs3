import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import type { S3Operations } from "../../../internal/s3-operations.types";
import type { Adapter } from "../../../types/adapter";
import type { StorageContext } from "../../../types/context";
import type { StorageOptions } from "../../../types/options";
import { createMultipartAbortRoute } from "./abort";

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
	completeMultipartUpload: vi.fn(),
	abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
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

describe("multipart/abort route", () => {
	it("aborts the upload and returns success", async () => {
		const endpoint = createMultipartAbortRoute();
		const { options, operations } = createContext();

		const result = await callEndpoint(endpoint, {
			body: {
				key: "uploads/file.bin",
				uploadId: "upload-123",
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(result).toEqual({ success: true });
		expect(operations.abortMultipartUpload).toHaveBeenCalledWith(
			"uploads/file.bin",
			"upload-123",
		);
	});

	it("throws MULTIPART_UPLOAD_FAILED when abort fails", async () => {
		const endpoint = createMultipartAbortRoute();
		const { options, operations } = createContext();
		(
			operations.abortMultipartUpload as ReturnType<typeof vi.fn>
		).mockRejectedValue(new Error("S3 abort error"));

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
			message: "Failed to abort multipart upload.",
			details: expect.objectContaining({
				key: "uploads/file.bin",
				uploadId: "upload-123",
				error: "S3 abort error",
			}),
		});
	});

	it("re-throws StorageServerError without wrapping", async () => {
		const endpoint = createMultipartAbortRoute();
		const { options, operations } = createContext();
		const existingError = new StorageServerError({
			code: StorageErrorCode.MULTIPART_UPLOAD_NOT_FOUND,
			message: "Multipart upload not found or expired.",
			details: { key: "uploads/file.bin", uploadId: "upload-123" },
		});
		(
			operations.abortMultipartUpload as ReturnType<typeof vi.fn>
		).mockRejectedValue(existingError);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toBe(existingError);
	});

	it("rejects invalid object key", async () => {
		const endpoint = createMultipartAbortRoute();
		const { options, operations } = createContext();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "../escape.bin",
					uploadId: "upload-123",
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
		const endpoint = createMultipartAbortRoute();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
		});
	});
});
