import { describe, expect, it } from "vitest";
import z from "zod";
import { fileInfoSchema } from "../schemas/file";
import { createStorageEndpoint } from "./create-storage-endpoint";

function createUploadUrlRoute() {
	const metadataSchema = z.object({
		userId: z.string(),
		userEmail: z.string(),
		age: z.number().optional(),
	});

	return createStorageEndpoint(
		"/upload-url",
		{
			method: "POST",
			body: z.object({
				file: fileInfoSchema,
			}),
			metadataSchema,

			outputSchema: z.object({
				name: z.string(),
				userId: z.string(),
			}),
		},
		async (ctx) => {
			try {
				const parsed = metadataSchema.safeParse(ctx.body.metadata);
				if (!parsed.success) {
					throw new Error("Invalid metadata");
				}
			} catch (error) {
				console.error(error);
				throw error;
			}

			return {
				name: ctx.body.file.name,
				userId: ctx.body.metadata.userId,
			};
		},
	);
}

describe("createStorageEndpoint", () => {
	it("should create an endpoint with metadata schema", () => {
		const endpoint = createUploadUrlRoute();

		expect(endpoint).toBeDefined();
		expect(typeof endpoint).toBe("function");
	});

	it("should call the endpoint with valid data and return expected response", async () => {
		const endpoint = createUploadUrlRoute();

		const result = await endpoint({
			body: {
				file: { name: "test.txt", size: 100, contentType: "text/plain" },
				metadata: {
					userId: "User123ABC",
					userEmail: "sdfsdf",
				},
			},
		});

		expect(result).toEqual({
			name: "test.txt",
			userId: "User123ABC",
		});
	});

	it("should handle different file names correctly", async () => {
		const endpoint = createUploadUrlRoute();

		const result = await endpoint({
			body: {
				file: { name: "document.pdf", size: 2048, contentType: "application/pdf" },
				metadata: {
					userId: "User456DEF",
					userEmail: "sdf",
				},
			},
		});

		expect(result.name).toBe("document.pdf");
		expect(result.userId).toBe("User456DEF");
	});
});
