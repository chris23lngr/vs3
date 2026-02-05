import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import z from "zod";
import { aws } from "../adapters";
import { createStorage } from "./create-storage";

describe("storage", () => {
	it("should create a storage instance", () => {
		const storage = createStorage({
			bucket: "test",
			adapter: aws({
				client: new S3Client({
					region: "us-east-1",
					credentials: {
						accessKeyId: "test",
						secretAccessKey: "test",
					},
				}),
			}),
		});

		expect(storage).toBeDefined();
	});
	it("should generate a presigned upload url", async () => {
		const storage = createStorage({
			bucket: "test",
			adapter: aws({
				client: new S3Client({
					region: "us-east-1",
				}),
			}),
			metadataSchema: z.object({
				userId: z.string(),
			}),
			generateKey(fileInfo) {
				return `${fileInfo.name}+${fileInfo.size}`;
			},
		});

		const result = await storage.api.upload({
			body: {
				file: {
					name: "test.txt",
					size: 100,
					contentType: "text/plain",
				},
				metadata: {
					userId: "sdf",
				},
			},
		});

		expect(result).toBeDefined();
		expect(result.name).toBe("test.txt+100");
	});
});
