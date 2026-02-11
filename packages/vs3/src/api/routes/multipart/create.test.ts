import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import type { S3Operations } from "../../../internal/s3-operations.types";
import type { Adapter } from "../../../types/adapter";
import type { StorageContext } from "../../../types/context";
import type { StorageOptions } from "../../../types/options";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import { createMultipartCreateRoute } from "./create";

const baseFileInfo = {
	name: "photo.png",
	size: 123,
	contentType: "image/png",
};

const createMockAdapter = (): Adapter => ({ client: {} }) as unknown as Adapter;

const createMockOperations = (
	overrides?: Partial<S3Operations>,
): S3Operations => ({
	generatePresignedUploadUrl: vi.fn(),
	generatePresignedDownloadUrl: vi.fn(),
	objectExists: vi.fn(),
	deleteObject: vi.fn(),
	createMultipartUpload: vi
		.fn()
		.mockResolvedValue({ uploadId: "mock-upload-id" }),
	presignUploadPart: vi.fn(),
	completeMultipartUpload: vi.fn(),
	abortMultipartUpload: vi.fn(),
	...overrides,
});

type ContextOverrides<M extends StandardSchemaV1> = {
	generateKey?: (
		fileInfo: typeof baseFileInfo,
		metadata: StandardSchemaV1.InferOutput<M>,
	) => string | Promise<string>;
	allowedFileTypes?: string[];
	contentValidators?: StorageOptions<M>["contentValidators"];
	contentValidatorTimeoutMs?: number;
	maxFileSize?: number;
};

const createTestContext = <M extends StandardSchemaV1>(
	metadataSchema: M,
	overrides: ContextOverrides<M> = {},
): { options: StorageOptions<M>; operations: S3Operations } => {
	const operations = createMockOperations();
	const { maxFileSize, ...rest } = overrides;
	return {
		options: {
			bucket: "test-bucket",
			adapter: createMockAdapter(),
			metadataSchema,
			...(maxFileSize !== undefined ? { maxFileSize } : {}),
			...rest,
		},
		operations,
	};
};

const callEndpoint = <T extends (input?: any) => any>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

describe("multipart/create route", () => {
	it("returns uploadId and key on success", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/abc.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		const result = await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				metadata: { userId: "user-1" },
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(result).toEqual({
			uploadId: "mock-upload-id",
			key: "uploads/abc.png",
		});
		expect(generateKey).toHaveBeenCalledWith(baseFileInfo, {
			userId: "user-1",
		});
	});

	it("calls createMultipartUpload with correct options", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/xyz.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				acl: "public-read",
				encryption: { type: "SSE-S3" },
				metadata: { userId: "user-2" },
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(operations.createMultipartUpload).toHaveBeenCalledWith(
			"uploads/xyz.png",
			expect.objectContaining({
				contentType: baseFileInfo.contentType,
				acl: "public-read",
				metadata: { userId: "user-2" },
				encryption: { type: "SSE-S3" },
			}),
		);
	});

	it("parses metadata and passes parsed output to generateKey", async () => {
		const metadataSchema = z.object({ uploadCount: z.coerce.number() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/parsed.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				metadata: { uploadCount: "42" },
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(generateKey).toHaveBeenCalledWith(baseFileInfo, {
			uploadCount: 42,
		});
	});

	it("throws INTERNAL_SERVER_ERROR when context options are missing", async () => {
		const endpoint = createMultipartCreateRoute(z.object({ userId: z.string() }));

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { userId: "missing-context" },
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Storage context is not available.",
		});
	});

	it("rejects invalid file names", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: { ...baseFileInfo, name: "../private.png" },
					metadata: { userId: "user-1" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INVALID_FILENAME,
		});
	});

	it("rejects invalid generated keys", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey: vi.fn().mockResolvedValue("../secret.png"),
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { userId: "user-1" },
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

	it("rejects file exceeding size limit", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema, {
			maxFileSize: 1000,
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: { ...baseFileInfo, size: 1001 },
					metadata: { userId: "user-1" },
				},
				context: {
					$options: { ...options, maxFileSize: 1000 },
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.FILE_TOO_LARGE,
			details: {
				fileSize: 1001,
				maxFileSize: 1000,
				fileName: baseFileInfo.name,
			},
		});
	});

	it("rejects file when MIME type is not allowed", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema, {
			allowedFileTypes: ["image/png"],
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: { ...baseFileInfo, contentType: "image/jpeg" },
					metadata: { userId: "user-1" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.FILE_TYPE_NOT_ALLOWED,
		});
	});

	it("rejects file when extension is not allowed", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema, {
			allowedFileTypes: [".png"],
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: {
						...baseFileInfo,
						name: "photo.jpg",
						contentType: "image/jpeg",
					},
					metadata: { userId: "user-1" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.FILE_TYPE_NOT_ALLOWED,
		});
	});

	it("returns METADATA_VALIDATION_ERROR for invalid metadata", async () => {
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: { input: { tag: "" }, output: { tag: "" } },
				validate: (value) => {
					const input = value as { tag?: string };
					if (input.tag && input.tag === input.tag.toLowerCase()) {
						return { value: input as { tag: string } };
					}
					return { issues: [{ message: "tag must be lowercase" }] };
				},
			},
		};

		const endpoint = createMultipartCreateRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { tag: "NOT-LOWER" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
		});
	});

	it("bubbles operations errors", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const operations = createMockOperations({
			createMultipartUpload: vi.fn(() => {
				throw new StorageServerError({
					code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
					message: "S3 error",
					details: "fail",
				});
			}),
		});
		const options: StorageOptions<typeof metadataSchema> = {
			bucket: "test-bucket",
			adapter: createMockAdapter(),
			metadataSchema,
		};

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { userId: "user" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
			message: "S3 error",
		});
	});

	it("does not require metadata when no schema is provided", async () => {
		const endpoint = createMultipartCreateRoute();
		const { options, operations } = createTestContext(z.undefined());

		await expect(
			callEndpoint(endpoint, {
				body: { fileInfo: baseFileInfo },
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).resolves.toMatchObject({
			uploadId: "mock-upload-id",
		});
	});

	it("rejects request when a content validator fails", async () => {
		const metadataSchema = z.object({ userId: z.string() });
		const endpoint = createMultipartCreateRoute(metadataSchema);
		const contentValidator = vi.fn().mockResolvedValue({
			valid: false,
			reason: "blocked by policy",
		});
		const { options, operations } = createTestContext(metadataSchema, {
			contentValidators: [contentValidator],
		});

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { userId: "user-1" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.CONTENT_VALIDATION_ERROR,
			message: "Content validation failed: blocked by policy",
		});
	});
});
