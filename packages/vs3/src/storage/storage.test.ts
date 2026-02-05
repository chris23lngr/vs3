import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
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
});
