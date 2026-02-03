import { S3Client } from "@aws-sdk/client-s3";
import z from "zod";
import { aws } from "./adapters";
import { createStorage } from "./storage";

// Test 1: Storage WITH metadata schema - metadata should be required
const s = createStorage({
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

s.api.upload({
	body: {
		file: new File([], "test.txt"),
	},
});

s.api.download({
	body: {
		key: "test.tex",
	},
});

const sM = createStorage({
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

sM.api.download({
	body: {
		key: "test.tex",
	},
});
