import { describe, expect, it } from "vitest";
import z from "zod";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import { mergeSchema, standardSchemaToZod } from "./merge-schema";

describe("standardSchemaToZod", () => {
	it("accepts valid input when validation succeeds", () => {
		const schema: StandardSchemaV1<{ id: string }, { id: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { id: "" },
					output: { id: "" },
				},
				validate: (value) => ({ value: value as { id: string } }),
			},
		};

		const zodSchema = standardSchemaToZod(schema);
		const result = zodSchema.safeParse({ id: "ok" });

		expect(result.success).toBe(true);
	});

	it("maps validation issues to zod errors with paths", () => {
		const schema: StandardSchemaV1<{ id: string }, { id: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { id: "" },
					output: { id: "" },
				},
				validate: () => ({
					issues: [
						{
							message: "invalid id",
							path: ["id"],
						},
					],
				}),
			},
		};

		const zodSchema = standardSchemaToZod(schema);
		const result = zodSchema.safeParse({ id: "bad" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("invalid id");
			expect(result.error.issues[0]?.path).toEqual(["id"]);
		}
	});

	it("captures thrown errors as zod issues", () => {
		const schema: StandardSchemaV1 = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => {
					throw new Error("boom");
				},
			},
		};

		const zodSchema = standardSchemaToZod(schema);
		const result = zodSchema.safeParse({ any: "value" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("boom");
		}
	});

	it("supports async validation failures", async () => {
		const schema: StandardSchemaV1<{ id: string }, { id: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { id: "" },
					output: { id: "" },
				},
				validate: async () => ({
					issues: [{ message: "async invalid", path: ["id"] }],
				}),
			},
		};

		const zodSchema = standardSchemaToZod(schema);
		const result = await zodSchema.safeParseAsync({ id: "bad" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("async invalid");
		}
	});
});

describe("mergeSchema", () => {
	it("requires both base body and metadata", () => {
		const baseSchema = z.object({
			name: z.string(),
		});
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { tag: "" },
					output: { tag: "" },
				},
				validate: (value) => ({ value: value as { tag: string } }),
			},
		};

		const merged = mergeSchema(baseSchema, metadataSchema);

		const missingMetadata = merged.safeParse({ name: "file" });
		expect(missingMetadata.success).toBe(false);
		if (!missingMetadata.success) {
			expect(missingMetadata.error.issues[0]?.path).toEqual(["metadata"]);
		}
	});

	it("prefixes metadata issues with metadata path", () => {
		const baseSchema = z.object({
			name: z.string(),
		});
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { tag: "" },
					output: { tag: "" },
				},
				validate: () => ({
					issues: [{ message: "bad tag", path: ["tag"] }],
				}),
			},
		};

		const merged = mergeSchema(baseSchema, metadataSchema);
		const result = merged.safeParse({ name: "file", metadata: { tag: "x" } });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["metadata", "tag"]);
		}
	});

	it("supports async metadata validation", async () => {
		const baseSchema = z.object({
			name: z.string(),
		});
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { tag: "" },
					output: { tag: "" },
				},
				validate: async () => ({
					issues: [{ message: "bad tag" }],
				}),
			},
		};

		const merged = mergeSchema(baseSchema, metadataSchema);
		const result = await merged.safeParseAsync({
			name: "file",
			metadata: { tag: "x" },
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("bad tag");
		}
	});
});
