import { S3Client } from "@aws-sdk/client-s3";
// ============================================================================
// Example 1: User uses ZOD for metadata
// ============================================================================
import { z } from "zod";
import { aws } from "../src/adapters";
import { createStorage } from "../src/storage";

const storageWithZod = createStorage({
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
	// User provides Zod schema for metadata
	metadataSchema: z.object({
		userId: z.string(),
		orgId: z.string().optional(),
	}),
});

storageWithZod.api.upload({
	body: {
		file: new File([], "test.txt"),
		metadata: {
			userId: "123",
			orgId: "org-456",
		},
	},
});

// ============================================================================
// Example 2: User uses VALIBOT for metadata
// ============================================================================
import * as v from "valibot";

const storageWithValibot = createStorage({
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
	// User provides Valibot schema for metadata
	metadataSchema: v.object({
		userId: v.string(),
		orgId: v.optional(v.string()),
		tags: v.array(v.string()),
	}),
});

storageWithValibot.api.upload({
	body: {
		file: new File([], "test.txt"),
		metadata: {
			userId: "123",
			tags: ["important"],
		},
	},
});

// ============================================================================
// Example 3: User uses ARKTYPE for metadata
// ============================================================================
import { type } from "arktype";

// ArkType schema
const userMetadataSchema = type({
	userId: "string",
	"orgId?": "string",
	role: "'admin' | 'user' | 'guest'",
});

const storageWithArkType = createStorage({
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
	// User provides ArkType schema for metadata
	metadataSchema: userMetadataSchema as any, // ArkType schemas are StandardSchemaV1
});

storageWithArkType.api.upload({
	body: {
		file: new File([], "test.txt"),
		metadata: {
			userId: "123",
			role: "admin",
		},
	},
});

// ============================================================================
// How it works behind the scenes
// ============================================================================

/*
1. Library defines base body with Zod:

   const baseSchema = z.object({
     file: z.instanceof(File)
   });

2. User provides metadata schema (any StandardSchemaV1 library)

3. Library wraps user's schema in Zod validator:

   baseSchema.extend({
     metadata: z.custom(async (val) => {
       // Uses StandardSchemaV1 interface
       const result = await userSchema['~standard'].validate(val);
       return result;
     })
   });

4. Result: Base uses Zod, metadata uses user's library!
*/

console.log("All validation libraries work!");
