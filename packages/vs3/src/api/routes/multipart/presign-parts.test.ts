import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import type { S3Operations } from "../../../internal/s3-operations.types";
import type { Adapter } from "../../../types/adapter";
import type { StorageContext } from "../../../types/context";
import type { StorageOptions } from "../../../types/options";
import { createMultipartPresignPartsRoute } from "./presign-parts";

const createMockAdapter = (): Adapter => ({ client: {} }) as unknown as Adapter;

const createMockOperations = (
	overrides?: Partial<S3Operations>,
): S3Operations => ({
	generatePresignedUploadUrl: vi.fn(),
	generatePresignedDownloadUrl: vi.fn(),
	objectExists: vi.fn(),
	deleteObject: vi.fn(),
	createMultipartUpload: vi.fn(),
	presignUploadPart: vi
		.fn()
		.mockImplementation(
			async (input) => `https://s3.example.com/part-${input.partNumber}`,
		),
	completeMultipartUpload: vi.fn(),
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

describe("multipart/presign-parts route", () => {
	it("returns presigned URLs for all requested parts", async () => {
		const endpoint = createMultipartPresignPartsRoute();
		const { options, operations } = createContext();

		const result = await callEndpoint(endpoint, {
			body: {
				key: "uploads/file.bin",
				uploadId: "upload-123",
				parts: [{ partNumber: 1 }, { partNumber: 2 }, { partNumber: 3 }],
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(result).toEqual({
			parts: [
				{ partNumber: 1, presignedUrl: "https://s3.example.com/part-1" },
				{ partNumber: 2, presignedUrl: "https://s3.example.com/part-2" },
				{ partNumber: 3, presignedUrl: "https://s3.example.com/part-3" },
			],
		});

		expect(operations.presignUploadPart).toHaveBeenCalledTimes(3);
		expect(operations.presignUploadPart).toHaveBeenCalledWith({
			key: "uploads/file.bin",
			uploadId: "upload-123",
			partNumber: 1,
		});
	});

	it("throws MULTIPART_UPLOAD_NOT_FOUND for NoSuchUpload by name", async () => {
		const endpoint = createMultipartPresignPartsRoute();
		const noSuchUpload = Object.assign(new Error("NoSuchUpload"), {
			name: "NoSuchUpload",
		});
		const { options, operations } = createContext();
		(operations.presignUploadPart as ReturnType<typeof vi.fn>).mockRejectedValue(
			noSuchUpload,
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "expired-id",
					parts: [{ partNumber: 1 }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_NOT_FOUND,
			message: "Multipart upload not found or expired.",
			details: { key: "uploads/file.bin", uploadId: "expired-id" },
		});
	});

	it("throws MULTIPART_UPLOAD_NOT_FOUND for NoSuchUpload by Code", async () => {
		const endpoint = createMultipartPresignPartsRoute();
		const noSuchUpload = Object.assign(new Error("Upload gone"), {
			Code: "NoSuchUpload",
		});
		const { options, operations } = createContext();
		(operations.presignUploadPart as ReturnType<typeof vi.fn>).mockRejectedValue(
			noSuchUpload,
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "expired-id",
					parts: [{ partNumber: 1 }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_NOT_FOUND,
		});
	});

	it("throws MULTIPART_UPLOAD_FAILED for other S3 errors", async () => {
		const endpoint = createMultipartPresignPartsRoute();
		const { options, operations } = createContext();
		(operations.presignUploadPart as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("Some S3 error"),
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1 }],
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
			message: "Failed to presign upload parts.",
			details: expect.objectContaining({
				error: "Some S3 error",
			}),
		});
	});

	it("rejects invalid object key", async () => {
		const endpoint = createMultipartPresignPartsRoute();
		const { options, operations } = createContext();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "../secret.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1 }],
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
		const endpoint = createMultipartPresignPartsRoute();

		await expect(
			callEndpoint(endpoint, {
				body: {
					key: "uploads/file.bin",
					uploadId: "upload-123",
					parts: [{ partNumber: 1 }],
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
		});
	});
});
