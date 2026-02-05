import { S3Client } from "@aws-sdk/client-s3";
import z from "zod";
import { aws } from "./adapters";
import { createStorage } from "./storage/create-storage";

// Storage with metadata schema defined
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
	metadataSchema: z.object({
		userId: z.string(),
		orgId: z.string().optional(),
	}),
});

storage.api.upload({
	body: {
		fileInfo: {
			contentType: "text/plain",
			name: "test.txt",
			size: 100,
		},
		metadata: {
			userId: "sdf",
			orgId: "sdf",
		},
	},
});

storage.api.uploadUrl({
	body: {
		fileInfo: {
			contentType: "text/plain",
			name: "test.txt",
			size: 100,
		},
		metadata: {
			userId: "sdf",
		},
	},
});
