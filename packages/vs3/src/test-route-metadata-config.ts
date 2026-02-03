import { S3Client } from "@aws-sdk/client-s3";
import z from "zod";
import { aws } from "./adapters";
import { createStorage } from "./storage";

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

// ============================================================================
// UPLOAD ROUTE - Requires metadata
// ============================================================================

// ✅ This should work - metadata is provided
storage.api.upload({
	body: {
		file: new File([], "test.txt"),
		metadata: {
			userId: "123",
		},
	},
});

// ❌ This should error - metadata is missing
storage.api.upload({
	// @ts-expect-error - Property 'metadata' is missing
	body: {
		file: new File([], "test.txt"),
	},
});

// ============================================================================
// DELETE ROUTE - Requires metadata
// ============================================================================

// ✅ This should work - metadata is provided
storage.api.delete({
	body: {
		key: "file-key",
		metadata: {
			userId: "123",
		},
	},
});

// ❌ This should error - metadata is missing
storage.api.delete({
	// @ts-expect-error - Property 'metadata' is missing
	body: {
		key: "file-key",
	},
});

// ============================================================================
// DOWNLOAD ROUTE - Does NOT require metadata
// ============================================================================

// ✅ This should work - no metadata needed
storage.api.download({
	body: {
		key: "file-key",
	},
});

// ❌ This should error - metadata field should not exist on download
storage.api.download({
	body: {
		key: "file-key",
		// @ts-expect-error - Object literal may only specify known properties
		metadata: {
			userId: "123",
		},
	},
});

// ============================================================================
// Test with storage WITHOUT metadata schema
// ============================================================================

const storageNoMetadata = createStorage({
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
	// No metadataSchema
});

// ✅ Upload without metadata - works
storageNoMetadata.api.upload({
	body: {
		file: new File([], "test.txt"),
	},
});

// ✅ Delete without metadata - works
storageNoMetadata.api.delete({
	body: {
		key: "file-key",
	},
});

// ✅ Download without metadata - works
storageNoMetadata.api.download({
	body: {
		key: "file-key",
	},
});

console.log("All route metadata configuration tests passed!");
