import { describe, expect, expectTypeOf, it } from "vitest";
import z from "zod";
import { getCurrentStorageContext } from "../context/endpoint-context";
import { fileInfoSchema } from "../schemas/file";
import type { StandardSchemaV1 } from "../types/standard-schema";
import { createStorageEndpoint } from "./create-storage-endpoint";

const callEndpoint = <T extends (input?: any) => any>(
	endpoint: T,
	input: unknown,
) => endpoint(input as Parameters<T>[0]);

describe("createStorageEndpoint", () => {
	it("creates a callable endpoint with a stable type surface", () => {
		const endpoint = createStorageEndpoint(
			"/upload-url",
			{
				method: "POST",
				body: z.object({
					file: fileInfoSchema,
				}),
				metadataSchema: z.object({
					userId: z.string(),
				}),
				outputSchema: z.object({
					key: z.string(),
				}),
			},
			async (ctx) => ({
				key: `${ctx.body.file.name}-${ctx.body.metadata.userId}`,
			}),
		);

		expect(endpoint).toBeTypeOf("function");
		// @ts-expect-error TODO: Fix this
		expectTypeOf(endpoint).parameter(0).toBeAny();
	});

	it("merges body and metadata schemas and returns handler output", async () => {
		const endpoint = createStorageEndpoint(
			"/upload-url",
			{
				method: "POST",
				body: z.object({
					file: fileInfoSchema,
				}),
				metadataSchema: z.object({
					userId: z.string(),
				}),
				outputSchema: z.object({
					fileName: z.string(),
					userId: z.string(),
				}),
			},
			async (ctx) => ({
				fileName: ctx.body.file.name,
				userId: ctx.body.metadata.userId,
			}),
		);

		const result = await callEndpoint(endpoint, {
			body: {
				file: {
					name: "photo.png",
					size: 10,
					contentType: "image/png",
				},
				metadata: {
					userId: "user-1",
				},
			},
		});

		expect(result).toEqual({
			fileName: "photo.png",
			userId: "user-1",
		});
	});

	it("surfaces body validation errors as APIError", async () => {
		const endpoint = createStorageEndpoint(
			"/upload-url",
			{
				method: "POST",
				body: z.object({
					file: fileInfoSchema,
				}),
				metadataSchema: z.object({
					userId: z.string(),
				}),
			},
			async () => ({
				ok: true,
			}),
		);

		const invalidFile = {
			name: "broken.txt",
			contentType: "text/plain",
		} as unknown as z.infer<typeof fileInfoSchema>;

		await expect(
			callEndpoint(endpoint, {
				body: {
					file: invalidFile,
					metadata: {
						userId: "user-1",
					},
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
		});
	});

	it("surfaces metadata validation errors as APIError", async () => {
		const endpoint = createStorageEndpoint(
			"/upload-url",
			{
				method: "POST",
				body: z.object({
					file: fileInfoSchema,
				}),
				metadataSchema: z.object({
					userId: z.string().min(3),
				}),
			},
			async () => ({
				ok: true,
			}),
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					file: {
						name: "photo.png",
						size: 10,
						contentType: "image/png",
					},
					metadata: {
						userId: "x",
					},
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
		});
	});

	it("supports async metadata validation via StandardSchemaV1", async () => {
		const metadataSchema: StandardSchemaV1<{ tag: string }, { tag: string }> = {
			"~standard": {
				version: 1,
				vendor: "test",
				types: {
					input: { tag: "" },
					output: { tag: "" },
				},
				validate: async (value) => {
					const input = value as { tag?: string };
					if (input.tag === "ok") {
						return { value: { tag: "ok" } };
					}
					return {
						issues: [{ message: "tag must be ok" }],
					};
				},
			},
		};

		const endpoint = createStorageEndpoint(
			"/upload-url",
			{
				method: "POST",
				body: z.object({
					file: fileInfoSchema,
				}),
				metadataSchema,
			},
			async () => ({
				ok: true,
			}),
		);

		await expect(
			callEndpoint(endpoint, {
				body: {
					file: {
						name: "photo.png",
						size: 10,
						contentType: "image/png",
					},
					metadata: {
						tag: "bad",
					},
				},
			}),
		).rejects.toMatchObject({
			name: "APIError",
			statusCode: 400,
		});
	});

	it("creates a metadata-only body when no body schema is provided", async () => {
		const endpoint = createStorageEndpoint(
			"/metadata-only",
			{
				method: "POST",
				metadataSchema: z.object({
					role: z.string(),
				}),
			},
			async (ctx) => ({
				role: ctx.body.metadata.role,
			}),
		);

		const result = await callEndpoint(endpoint, {
			body: {
				metadata: {
					role: "admin",
				},
			},
		});

		expect(result).toEqual({ role: "admin" });
	});

	it("exposes endpoint context via AsyncLocalStorage", async () => {
		const endpoint = createStorageEndpoint(
			"/context-check",
			{
				method: "POST",
				metadataSchema: z.object({
					userId: z.string(),
				}),
			},
			async () => {
				const current = await getCurrentStorageContext();
				return {
					path: current.path,
					hasContext: Boolean(current.context),
				};
			},
		);

		const result = await callEndpoint(endpoint, {
			body: {
				metadata: {
					userId: "user-1",
				},
			},
			context: {
				$options: {},
			},
		});

		expect(result).toEqual({
			path: "/context-check",
			hasContext: true,
		});
	});
});
