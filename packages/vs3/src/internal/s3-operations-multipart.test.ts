import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	type S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3Operations } from "./s3-operations";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
	getSignedUrl: vi
		.fn()
		.mockResolvedValue("https://s3.example.com/presigned-part"),
}));

function createMockClient(overrides: Partial<S3Client> = {}): S3Client {
	return {
		send: vi.fn(),
		...overrides,
	} as unknown as S3Client;
}

const resolveBucket = (bucket?: string): string => bucket ?? "default-bucket";

describe("createS3Operations — multipart", () => {
	describe("createMultipartUpload", () => {
		it("sends CreateMultipartUploadCommand and returns uploadId", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({ UploadId: "test-upload-id" }),
			});
			const ops = createS3Operations({ client, resolveBucket });

			const result = await ops.createMultipartUpload("photos/large.mp4", {
				contentType: "video/mp4",
			});

			expect(result).toEqual({ uploadId: "test-upload-id" });
			expect(client.send).toHaveBeenCalledWith(
				expect.any(CreateMultipartUploadCommand),
			);

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CreateMultipartUploadCommand;
			expect(command.input.Bucket).toBe("default-bucket");
			expect(command.input.Key).toBe("photos/large.mp4");
			expect(command.input.ContentType).toBe("video/mp4");
		});

		it("throws when S3 does not return an UploadId", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await expect(ops.createMultipartUpload("photos/large.mp4")).rejects.toThrow(
				"S3 did not return an UploadId",
			);
		});

		it("uses bucket override when provided", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({ UploadId: "id-1" }),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.createMultipartUpload("key.txt", {
				bucket: "other-bucket",
			});

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CreateMultipartUploadCommand;
			expect(command.input.Bucket).toBe("other-bucket");
		});

		it("passes ACL and metadata", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({ UploadId: "id-2" }),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.createMultipartUpload("key.txt", {
				acl: "public-read",
				metadata: { userId: "user-1" },
			});

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CreateMultipartUploadCommand;
			expect(command.input.ACL).toBe("public-read");
			expect(command.input.Metadata).toEqual({ userId: "user-1" });
		});

		it("filters out undefined metadata values", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({ UploadId: "id-3" }),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.createMultipartUpload("key.txt", {
				metadata: { a: "1", b: undefined as unknown as string },
			});

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CreateMultipartUploadCommand;
			expect(command.input.Metadata).toEqual({ a: "1" });
		});
	});

	describe("presignUploadPart", () => {
		it("returns a presigned URL for the part", async () => {
			const client = createMockClient();
			const ops = createS3Operations({ client, resolveBucket });

			const url = await ops.presignUploadPart({
				key: "photos/large.mp4",
				uploadId: "upload-123",
				partNumber: 3,
			});

			expect(url).toBe("https://s3.example.com/presigned-part");
		});

		it("creates UploadPartCommand with correct params", async () => {
			const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const client = createMockClient();
			const ops = createS3Operations({ client, resolveBucket });

			await ops.presignUploadPart({
				key: "photos/large.mp4",
				uploadId: "upload-123",
				partNumber: 5,
			});

			expect(getSignedUrl).toHaveBeenCalledWith(
				client,
				expect.any(UploadPartCommand),
				{ expiresIn: 3600 },
			);
		});

		it("uses bucket override", async () => {
			const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const client = createMockClient();
			const ops = createS3Operations({ client, resolveBucket });

			await ops.presignUploadPart(
				{ key: "k", uploadId: "u", partNumber: 1 },
				{ bucket: "custom-bucket" },
			);

			const command = vi.mocked(getSignedUrl).mock.calls.at(-1)?.[1];
			expect((command as UploadPartCommand).input.Bucket).toBe("custom-bucket");
		});

		it("returns SSE-C headers and command input when encryption is provided", async () => {
			const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
			const client = createMockClient();
			const ops = createS3Operations({ client, resolveBucket });

			const result = await ops.presignUploadPart(
				{ key: "k", uploadId: "u", partNumber: 1 },
				{
					encryption: {
						type: "SSE-C",
						customerKey: "dGVzdC1rZXktYmFzZTY0",
					},
				},
			);

			expect(result).toEqual(
				expect.objectContaining({
					url: "https://s3.example.com/presigned-part",
					headers: expect.objectContaining({
						"x-amz-server-side-encryption-customer-algorithm": "AES256",
						"x-amz-server-side-encryption-customer-key": "dGVzdC1rZXktYmFzZTY0",
						"x-amz-server-side-encryption-customer-key-MD5": expect.any(String),
					}),
				}),
			);

			const command = vi.mocked(getSignedUrl).mock.calls.at(-1)?.[1];
			expect((command as UploadPartCommand).input.SSECustomerAlgorithm).toBe(
				"AES256",
			);
			expect((command as UploadPartCommand).input.SSECustomerKey).toBe(
				"dGVzdC1rZXktYmFzZTY0",
			);
			expect((command as UploadPartCommand).input.SSECustomerKeyMD5).toEqual(
				expect.any(String),
			);
		});
	});

	describe("completeMultipartUpload", () => {
		it("sends CompleteMultipartUploadCommand with mapped parts", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.completeMultipartUpload({
				key: "photos/large.mp4",
				uploadId: "upload-123",
				parts: [
					{ partNumber: 1, eTag: '"etag-1"' },
					{ partNumber: 2, eTag: '"etag-2"' },
				],
			});

			expect(client.send).toHaveBeenCalledWith(
				expect.any(CompleteMultipartUploadCommand),
			);

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CompleteMultipartUploadCommand;
			expect(command.input.Key).toBe("photos/large.mp4");
			expect(command.input.UploadId).toBe("upload-123");
			expect(command.input.MultipartUpload?.Parts).toEqual([
				{ PartNumber: 1, ETag: '"etag-1"' },
				{ PartNumber: 2, ETag: '"etag-2"' },
			]);
		});

		it("uses bucket override", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.completeMultipartUpload(
				{
					key: "k",
					uploadId: "u",
					parts: [{ partNumber: 1, eTag: '"e"' }],
				},
				{ bucket: "alt-bucket" },
			);

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as CompleteMultipartUploadCommand;
			expect(command.input.Bucket).toBe("alt-bucket");
		});
	});

	describe("abortMultipartUpload", () => {
		it("sends AbortMultipartUploadCommand", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.abortMultipartUpload("photos/large.mp4", "upload-123");

			expect(client.send).toHaveBeenCalledWith(
				expect.any(AbortMultipartUploadCommand),
			);

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as AbortMultipartUploadCommand;
			expect(command.input.Bucket).toBe("default-bucket");
			expect(command.input.Key).toBe("photos/large.mp4");
			expect(command.input.UploadId).toBe("upload-123");
		});

		it("uses bucket override", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await ops.abortMultipartUpload("k", "u", { bucket: "other" });

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as AbortMultipartUploadCommand;
			expect(command.input.Bucket).toBe("other");
		});

		it("propagates S3 errors", async () => {
			const client = createMockClient({
				send: vi.fn().mockRejectedValue(new Error("S3 failure")),
			});
			const ops = createS3Operations({ client, resolveBucket });

			await expect(ops.abortMultipartUpload("k", "u")).rejects.toThrow(
				"S3 failure",
			);
		});
	});
});
