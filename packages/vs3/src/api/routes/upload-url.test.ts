import { describe, expect, expectTypeOf, it, vi } from "vitest";
import z from "zod";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type { S3Operations } from "../../internal/s3-operations.types";
import type { Adapter } from "../../types/adapter";
import type { StorageContext } from "../../types/context";
import type { StorageOptions } from "../../types/options";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import { createUploadUrlRoute } from "./upload-url";

const baseFileInfo = {
	name: "photo.png",
	size: 123,
	contentType: "image/png",
};

const createMockAdapter = (): Adapter => ({ client: {} }) as unknown as Adapter;

const createMockOperations = (
	overrides?: Partial<S3Operations>,
): S3Operations => ({
	generatePresignedUploadUrl: vi
		.fn()
		.mockResolvedValue("https://example.com/upload"),
	generatePresignedDownloadUrl: vi.fn(),
	objectExists: vi.fn().mockResolvedValue(true),
	deleteObject: vi.fn(),
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
	hooks?: StorageOptions<M>["hooks"];
};

const createTestContext = <M extends StandardSchemaV1>(
	metadataSchema: M,
	overrides: ContextOverrides<M> = {},
): { options: StorageOptions<M>; operations: S3Operations } => {
	const operations = createMockOperations();
	return {
		options: {
			bucket: "test-bucket",
			adapter: createMockAdapter(),
			metadataSchema,
			...overrides,
		},
		operations,
	};
};

const callEndpoint = <T extends (input?: any) => any>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

describe("upload-url route", () => {
	it("returns a presigned URL and key", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/abc.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		const result = await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				metadata: {
					userId: "user-1",
				},
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(result).toEqual({
			presignedUrl: "https://example.com/upload",
			key: "uploads/abc.png",
		});
		expect(generateKey).toHaveBeenCalledWith(baseFileInfo, {
			userId: "user-1",
		});
	});

	it("passes adapter options derived from the request", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
			region: z.string().optional(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/xyz.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				expiresIn: 120,
				acl: "public-read",
				encryption: {
					type: "SSE-S3",
				},
				metadata: {
					userId: "user-2",
					region: "eu",
				},
			},
			context: {
				$options: options,
				$operations: operations,
			} satisfies Omit<StorageContext, "$middleware">,
		});

		expect(operations.generatePresignedUploadUrl).toHaveBeenCalledWith(
			"uploads/xyz.png",
			baseFileInfo,
			expect.objectContaining({
				expiresIn: 120,
				contentType: baseFileInfo.contentType,
				acl: "public-read",
				metadata: {
					userId: "user-2",
					region: "eu",
				},
				encryption: {
					type: "SSE-S3",
				},
			}),
		);
	});

	it("parses metadata and passes parsed output to generateKey", async () => {
		const metadataSchema = z.object({
			uploadCount: z.coerce.number(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const generateKey = vi.fn().mockResolvedValue("uploads/parsed.png");
		const { options, operations } = createTestContext(metadataSchema, {
			generateKey,
		});

		await callEndpoint(endpoint, {
			body: {
				fileInfo: baseFileInfo,
				metadata: {
					uploadCount: "42",
				},
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

	it("returns upload headers when operations provides them", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const operations = createMockOperations({
			generatePresignedUploadUrl: vi.fn().mockResolvedValue({
				url: "https://example.com/upload",
				headers: {
					"x-amz-server-side-encryption": "AES256",
				},
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
					metadata: {
						userId: "user-1",
					},
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).resolves.toMatchObject({
			presignedUrl: "https://example.com/upload",
			uploadHeaders: {
				"x-amz-server-side-encryption": "AES256",
			},
		});
	});

	it("throws INTERNAL_SERVER_ERROR when context options are missing", async () => {
		const endpoint = createUploadUrlRoute(
			z.object({
				userId: z.string(),
			}),
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: {
						userId: "missing-context",
					},
				},
				context: {},
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Storage context is not available.",
		});
	});

	it("provides helpful error message when context is missing", async () => {
		const endpoint = createUploadUrlRoute(
			z.object({
				userId: z.string(),
			}),
		);

		try {
			await callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: {
						userId: "test",
					},
				},
				context: {},
			});
			// Should not reach here
			expect(true).toBe(false);
		} catch (error) {
			expect(error).toBeInstanceOf(StorageServerError);
			const storageError = error as StorageServerError;
			expect(storageError.message).toContain("Storage context is not available");
			expect(storageError.details).toContain("createStorage()");
			expect(storageError.details).toContain(
				"not calling raw endpoint handlers directly",
			);
		}
	});

	it("surfaces schema validation errors for invalid file info", async () => {
		const endpoint = createUploadUrlRoute(
			z.object({
				userId: z.string(),
			}),
		);
		const invalidFileInfo = {
			name: "missing-size.txt",
			contentType: "text/plain",
		} as unknown as typeof baseFileInfo;

		const { options, operations } = createTestContext(
			z.object({
				userId: z.string(),
			}),
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: invalidFileInfo,
					metadata: {
						userId: "user",
					},
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

	it("returns METADATA_VALIDATION_ERROR for invalid metadata", async () => {
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { tag: "" },
					output: { tag: "" },
				},
				validate: (value) => {
					const input = value as { tag?: string };
					if (input.tag && input.tag === input.tag.toLowerCase()) {
						return { value: input as { tag: string } };
					}
					return {
						issues: [
							{
								message: "tag must be lowercase",
							},
						],
					};
				},
			},
		};

		const endpoint = createUploadUrlRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: {
						tag: "NOT-LOWER",
					},
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
		const metadataSchema = z.object({
			userId: z.string(),
		});
		const endpoint = createUploadUrlRoute(metadataSchema);
		const operations = createMockOperations({
			generatePresignedUploadUrl: vi.fn(() => {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "Adapter error",
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
					metadata: {
						userId: "user",
					},
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			message: "Adapter error",
		});
	});

	it("does not require metadata when no metadata schema is provided", async () => {
		const endpoint = createUploadUrlRoute();
		const { options, operations } = createTestContext(z.undefined());

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).resolves.toMatchObject({
			presignedUrl: "https://example.com/upload",
		});
	});

	it("enforces metadata types when schema is provided", () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});
		const endpoint = createUploadUrlRoute(metadataSchema);

		// @ts-expect-error TODO: Fix this
		expectTypeOf(endpoint).parameter(0).toBeUnknown();
	});

	it("does not require metadata types when schema is omitted", () => {
		const endpoint = createUploadUrlRoute();

		// @ts-expect-error TODO: Fix this
		expectTypeOf(endpoint).parameter(0).toBeUnknown();
	});

	it("rejects request when metadata is required but not provided", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: undefined,
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
			body: {
				code: "VALIDATION_ERROR",
			},
		});
	});

	it("rejects request when metadata is required but is null", async () => {
		const metadataSchema = z.object({
			userId: z.string(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: null,
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
			body: {
				code: "VALIDATION_ERROR",
			},
		});
	});

	it("allows empty metadata object when all metadata fields are optional", async () => {
		const metadataSchema = z.object({
			userId: z.string().optional(),
		});

		const endpoint = createUploadUrlRoute(metadataSchema);
		const { options, operations } = createTestContext(metadataSchema);

		// Metadata is required by the registry, but since all fields in the schema
		// are optional, an empty object {} is valid and should pass validation
		await expect(
			callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: {},
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			}),
		).resolves.toMatchObject({
			presignedUrl: "https://example.com/upload",
		});
	});

	describe("file type validation", () => {
		it("accepts file when MIME type is allowed", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				allowedFileTypes: ["image/png"],
			});

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo: baseFileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).resolves.toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
		});

		it("rejects file when MIME type is not allowed", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				allowedFileTypes: ["image/png"],
			});

			const fileInfo = {
				...baseFileInfo,
				contentType: "image/jpeg",
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.FILE_TYPE_NOT_ALLOWED,
				message: "File type is not allowed.",
			});
		});

		it("rejects file when extension is not allowed", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				allowedFileTypes: [".png"],
			});

			const fileInfo = {
				...baseFileInfo,
				name: "photo.jpg",
				contentType: "image/jpeg",
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.FILE_TYPE_NOT_ALLOWED,
				message: "File extension is not allowed.",
			});
		});

		it("rejects invalid file names", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);

			const fileInfo = {
				...baseFileInfo,
				name: "../private.png",
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.INVALID_FILENAME,
				message: "Invalid file name.",
			});
		});

		it("rejects invalid generated keys", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				generateKey: vi.fn().mockResolvedValue("../secret.png"),
			});

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo: baseFileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid object key.",
			});
		});
	});

	describe("file size validation", () => {
		it("accepts file within size limit", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);
			const contextOptions = {
				...options,
				maxFileSize: 1000,
			};

			const fileInfo = {
				...baseFileInfo,
				size: 500,
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: contextOptions,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).resolves.toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
		});

		it("accepts file exactly at size limit", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);
			const contextOptions = {
				...options,
				maxFileSize: 1000,
			};

			const fileInfo = {
				...baseFileInfo,
				size: 1000,
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: contextOptions,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).resolves.toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
		});

		it("rejects file exceeding size limit", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);
			const contextOptions = {
				...options,
				maxFileSize: 1000,
			};

			const fileInfo = {
				...baseFileInfo,
				size: 1001,
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: contextOptions,
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

		it("accepts any file size when maxFileSize is not configured", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);

			const fileInfo = {
				...baseFileInfo,
				size: 999999999,
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).resolves.toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
		});

		it("includes comprehensive error details when file is too large", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);
			const contextOptions = {
				...options,
				maxFileSize: 5000000,
			};

			const fileInfo = {
				name: "large-video.mp4",
				size: 10000000,
				contentType: "video/mp4",
			};

			await expect(
				callEndpoint(endpoint, {
					body: {
						fileInfo,
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: contextOptions,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.FILE_TOO_LARGE,
				details: {
					fileSize: 10000000,
					maxFileSize: 5000000,
					fileName: "large-video.mp4",
				},
			});
		});
	});

	describe("upload hooks", () => {
		it("throws FORBIDDEN when beforeUpload hook rejects", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: {
					beforeUpload: vi
						.fn()
						.mockResolvedValue({ success: false, reason: "Not allowed" }),
				},
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
				code: StorageErrorCode.FORBIDDEN,
				message: "Not allowed",
			});
		});

		it("uses default message when beforeUpload hook rejects without reason", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: {
					beforeUpload: vi.fn().mockResolvedValue({ success: false }),
				},
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
				code: StorageErrorCode.FORBIDDEN,
				message: "Upload rejected by hook.",
			});
		});

		it("proceeds when beforeUpload hook accepts", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const beforeUpload = vi.fn().mockResolvedValue({ success: true });
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: { beforeUpload },
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

			expect(result).toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
			expect(beforeUpload).toHaveBeenCalledWith(baseFileInfo, {
				userId: "user-1",
			});
		});

		it("calls afterUpload hook with fileInfo, metadata, and key", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const afterUpload = vi.fn().mockResolvedValue(undefined);
			const generateKey = vi.fn().mockResolvedValue("uploads/abc.png");
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: { afterUpload },
				generateKey,
			});

			await callEndpoint(endpoint, {
				body: {
					fileInfo: baseFileInfo,
					metadata: { userId: "user-1" },
				},
				context: {
					$options: options,
					$operations: operations,
				} satisfies Omit<StorageContext, "$middleware">,
			});

			expect(afterUpload).toHaveBeenCalledWith(
				baseFileInfo,
				{ userId: "user-1" },
				"uploads/abc.png",
			);
		});

		it("propagates afterUpload hook errors", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const afterUpload = vi.fn().mockRejectedValue(new Error("hook failed"));
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: { afterUpload },
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
			).rejects.toThrow("hook failed");
		});

		it("works without any hooks configured", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema);

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

			expect(result).toMatchObject({
				presignedUrl: "https://example.com/upload",
			});
		});

		it("does not call operations when beforeUpload rejects", async () => {
			const metadataSchema = z.object({ userId: z.string() });
			const endpoint = createUploadUrlRoute(metadataSchema);
			const { options, operations } = createTestContext(metadataSchema, {
				hooks: {
					beforeUpload: vi
						.fn()
						.mockResolvedValue({ success: false, reason: "denied" }),
				},
			});

			try {
				await callEndpoint(endpoint, {
					body: {
						fileInfo: baseFileInfo,
						metadata: { userId: "user-1" },
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				});
			} catch {
				// expected
			}

			expect(operations.generatePresignedUploadUrl).not.toHaveBeenCalled();
		});
	});

	describe("content validation", () => {
		it("rejects request when a content validator fails", async () => {
			const metadataSchema = z.object({
				userId: z.string(),
			});

			const endpoint = createUploadUrlRoute(metadataSchema);
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
						metadata: {
							userId: "user-1",
						},
					},
					context: {
						$options: options,
						$operations: operations,
					} satisfies Omit<StorageContext, "$middleware">,
				}),
			).rejects.toMatchObject({
				code: StorageErrorCode.CONTENT_VALIDATION_ERROR,
				message: "Content validation failed: blocked by policy",
				details: {
					validatorIndex: 0,
					reason: "blocked by policy",
					fileName: baseFileInfo.name,
				},
			});
		});
	});
});
