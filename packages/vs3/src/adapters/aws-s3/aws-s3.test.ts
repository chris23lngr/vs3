import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createAwsS3Adapter } from "./aws-s3";

function createMockClient(overrides: Partial<S3Client> = {}): S3Client {
	return {
		send: vi.fn(),
		...overrides,
	} as unknown as S3Client;
}

describe("createAwsS3Adapter", () => {
	describe("objectExists", () => {
		it("returns true when HeadObject succeeds", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const adapter = createAwsS3Adapter({ client, bucket: "my-bucket" });

			const result = await adapter.objectExists("photos/cat.png");

			expect(result).toBe(true);
			expect(client.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
		});

		it("returns false when S3 responds with NotFound", async () => {
			const notFound = Object.assign(new Error("NotFound"), {
				name: "NotFound",
				$metadata: { httpStatusCode: 404 },
			});
			const client = createMockClient({
				send: vi.fn().mockRejectedValue(notFound),
			});
			const adapter = createAwsS3Adapter({ client, bucket: "my-bucket" });

			const result = await adapter.objectExists("photos/missing.png");

			expect(result).toBe(false);
		});

		it("returns false when S3 responds with 404 metadata only", async () => {
			const error = Object.assign(new Error("Unknown"), {
				name: "UnknownError",
				$metadata: { httpStatusCode: 404 },
			});
			const client = createMockClient({
				send: vi.fn().mockRejectedValue(error),
			});
			const adapter = createAwsS3Adapter({ client, bucket: "my-bucket" });

			const result = await adapter.objectExists("photos/missing.png");

			expect(result).toBe(false);
		});

		it("throws non-404 errors", async () => {
			const forbidden = Object.assign(new Error("Forbidden"), {
				name: "Forbidden",
				$metadata: { httpStatusCode: 403 },
			});
			const client = createMockClient({
				send: vi.fn().mockRejectedValue(forbidden),
			});
			const adapter = createAwsS3Adapter({ client, bucket: "my-bucket" });

			await expect(adapter.objectExists("photos/secret.png")).rejects.toThrow(
				"Forbidden",
			);
		});

		it("uses bucket override when provided", async () => {
			const client = createMockClient({
				send: vi.fn().mockResolvedValue({}),
			});
			const adapter = createAwsS3Adapter({ client, bucket: "default-bucket" });

			await adapter.objectExists("key.txt", { bucket: "other-bucket" });

			const command = (client.send as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as HeadObjectCommand;
			expect(command.input.Bucket).toBe("other-bucket");
			expect(command.input.Key).toBe("key.txt");
		});
	});
});
