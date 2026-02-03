/**
 * Route-Aware API Usage Examples
 *
 * This file demonstrates how to use the route-aware API with full type safety.
 * Run with: pnpm dev
 */

import { z } from "zod";
import { v } from "../src/index";

// Configure storage with multiple routes
const storage = v({
	bucket: "my-app-uploads",
	baseUrl: "https://storage.example.com",
	adapter: {
		async generatePresignedUrl(key: string) {
			// In production, this would generate a real presigned URL from S3/R2/etc
			return `https://presigned-url.example.com/${key}`;
		},
	},
	routes: {
		// Profile images - requires user metadata
		profile: {
			maxFileSize: 5 * 1024 * 1024, // 5MB
			metadata: z.object({
				userId: z.string().uuid(),
				username: z.string().min(3),
			}),
		},

		// Documents - requires document type
		documents: {
			maxFileSize: 50 * 1024 * 1024, // 50MB
			metadata: z.object({
				documentType: z.enum(["contract", "invoice", "report"]),
				caseId: z.string().regex(/^CASE-\d{4}-\d{3}$/),
			}),
		},

		// Public files - no metadata required
		public: {
			maxFileSize: 10 * 1024 * 1024, // 10MB
		},

		// Media files - requires media type
		media: {
			maxFileSize: 100 * 1024 * 1024, // 100MB
			metadata: z.object({
				mediaType: z.enum(["image", "video", "audio"]),
				albumId: z.string().optional(),
			}),
		},
	},
});

// Example 1: Upload profile image with user metadata
async function _uploadProfileImage() {
	const profileImage = new File(["image data"], "avatar.jpg", {
		type: "image/jpeg",
	});

	// ✅ Type-safe: metadata is required and properly typed
	const result = await storage.api.profile.uploadUrl(
		{ body: { file: profileImage } },
		{
			userId: "123e4567-e89b-12d3-a456-426614174000",
			username: "johndoe",
		},
	);

	console.log("Profile upload result:", result);
	// Output: {
	//   success: true,
	//   presignedUrl: "https://presigned-url.example.com/profile/avatar.jpg",
	//   route: "profile",
	//   metadata: { userId: "...", username: "johndoe" },
	//   ...
	// }

	return result;
}

// Example 2: Upload legal document with case information
async function _uploadLegalDocument() {
	const contractPdf = new File(["pdf data"], "contract.pdf", {
		type: "application/pdf",
	});

	// ✅ Type-safe: requires documentType and caseId
	const result = await storage.api.documents.uploadUrl(
		{ body: { file: contractPdf } },
		{
			documentType: "contract",
			caseId: "CASE-2024-001",
		},
	);

	console.log("Document upload result:", result);
	return result;
}

// Example 3: Upload public file (no metadata needed)
async function _uploadPublicFile() {
	const publicFile = new File(["public data"], "readme.txt", {
		type: "text/plain",
	});

	// ✅ Type-safe: metadata is optional (no second parameter needed)
	const result = await storage.api.public.uploadUrl({
		body: { file: publicFile },
	});

	console.log("Public upload result:", result);
	return result;
}

// Example 4: Upload media file
async function _uploadMediaFile() {
	const videoFile = new File(["video data"], "vacation.mp4", {
		type: "video/mp4",
	});

	// ✅ Type-safe: requires mediaType, albumId is optional
	const result = await storage.api.media.uploadUrl(
		{ body: { file: videoFile } },
		{
			mediaType: "video",
			albumId: "summer-2024",
		},
	);

	console.log("Media upload result:", result);
	return result;
}

// Example 5: Type errors caught at compile-time
function _demonstrateTypeErrors() {
	const _file = new File(["data"], "file.txt");

	// ❌ TypeScript Error: Property 'avatar' does not exist
	// storage.api.avatar.uploadUrl({ body: { file } });

	// ❌ TypeScript Error: Expected 2 arguments, but got 1
	// storage.api.profile.uploadUrl({ body: { file } });

	// ❌ TypeScript Error: Missing required property 'userId'
	// storage.api.profile.uploadUrl(
	//   { body: { file } },
	//   { username: "test" }
	// );

	// ❌ TypeScript Error: Invalid enum value
	// storage.api.documents.uploadUrl(
	//   { body: { file } },
	//   { documentType: "invalid", caseId: "CASE-2024-001" }
	// );

	// ❌ TypeScript Error: metadata should be never for public route
	// storage.api.public.uploadUrl(
	//   { body: { file } },
	//   { extra: "data" }
	// );
}

// Example 6: Runtime validation errors
async function _demonstrateRuntimeValidation() {
	const file = new File(["data"], "file.txt");

	try {
		// Runtime error: Invalid UUID format
		await storage.api.profile.uploadUrl({ body: { file } }, {
			userId: "invalid-uuid",
			username: "test",
		} as never);
	} catch (error) {
		console.error("Validation error:", error);
		// Error: Metadata validation failed: Invalid uuid
	}

	try {
		// Runtime error: Username too short
		await storage.api.profile.uploadUrl({ body: { file } }, {
			userId: "123e4567-e89b-12d3-a456-426614174000",
			username: "ab", // Too short (min 3)
		} as never);
	} catch (error) {
		console.error("Validation error:", error);
		// Error: Metadata validation failed: String must contain at least 3 character(s)
	}

	try {
		// Runtime error: Invalid case ID format
		await storage.api.documents.uploadUrl({ body: { file } }, {
			documentType: "contract",
			caseId: "invalid-format",
		} as never);
	} catch (error) {
		console.error("Validation error:", error);
		// Error: Metadata validation failed: Invalid
	}
}

// Example 7: Accessing route information in a custom endpoint
/*
export const customEndpoint = createStorageEndpoint(
  "/custom",
  { method: "POST", body: z.object({ data: z.string() }) },
  async (ctx) => {
    // Access route context
    if (ctx.context.$route) {
      const { name, metadata } = ctx.context.$route;

      console.log(`Called from route: ${name}`);
      console.log(`With metadata:`, metadata);

      // Access route configuration
      const routeConfig = ctx.context.$options.routes[name];
      console.log(`Max file size for this route: ${routeConfig.maxFileSize}`);

      // Implement route-specific logic
      if (name === "profile") {
        // Special handling for profile route
        const { userId } = metadata as { userId: string; username: string };
        // ... use userId
      }
    }

    return { success: true };
  }
);
*/

// Run examples (commented out to avoid execution during import)
/*
async function main() {
  console.log("=== Route-Aware API Examples ===\n");

  await uploadProfileImage();
  await uploadLegalDocument();
  await uploadPublicFile();
  await uploadMediaFile();
  await demonstrateRuntimeValidation();

  console.log("\n=== All examples completed ===");
}

main().catch(console.error);
*/
