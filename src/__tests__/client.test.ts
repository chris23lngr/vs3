import { describe, expect, it, vi } from "vitest";
import {
	createStorageClient,
	createStorageClientFromServer,
	MetadataValidationError,
} from "../client";
import { createStorage } from "../storage";
import type { StandardSchemaV1 } from "../types/standard-schema";

const adapter = {
	async generatePresignedUploadUrl() {
		return "https://example.com/upload";
	},
	async generatePresignedDownloadUrl() {
		return "https://example.com/download";
	},
	async deleteObject() {
		return;
	},
};

function createSchema() {
	const schema: StandardSchemaV1<{ userId: string }, { userId: string }> = {
		"~standard": {
			version: 1,
			vendor: "test",
			validate: (value) => {
				if (value && typeof value === "object" && "userId" in value) {
					return { value: value as { userId: string } };
				}
				return {
					issues: [{ message: "userId required" }],
				};
			},
			types: {
				input: { userId: "" },
				output: { userId: "" },
			},
		},
	};
	return schema;
}

describe("client retries and error contracts", () => {
	it("retries on network failure", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("network"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ uploadUrl: "ok" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

		const client = createStorageClient({
			fetch: fetchMock,
			retry: { attempts: 1, delayMs: 0 },
		});

		const result = await client.uploadUrl({
			file: { name: "a.txt", size: 1, contentType: "text/plain" },
		});

		expect(result.uploadUrl).toBe("ok");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("parses standardized error contract", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error: {
						code: "BAD_REQUEST",
						message: "Nope",
						details: { field: "name" },
					},
				}),
				{ status: 400, headers: { "content-type": "application/json" } },
			),
		);

		const client = createStorageClient({ fetch: fetchMock });

		await expect(
			client.uploadUrl({
				file: { name: "a.txt", size: 1, contentType: "text/plain" },
			}),
		).rejects.toMatchObject({
			name: "StorageClientResponseError",
			status: 400,
			errorCode: "BAD_REQUEST",
			errorDetails: { field: "name" },
		});
	});
});

describe("hooks", () => {
	it("calls onRequest and onResponse hooks", async () => {
		const onRequest = vi.fn();
		const onResponse = vi.fn();
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ downloadUrl: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const client = createStorageClient({
			fetch: fetchMock,
			hooks: { onRequest, onResponse },
		});

		await client.downloadUrl({ key: "file" });

		expect(onRequest).toHaveBeenCalledTimes(1);
		expect(onResponse).toHaveBeenCalledTimes(1);
	});
});

describe("headers", () => {
	it("merges headers from defaults and request options across all HeadersInit shapes", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ downloadUrl: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const defaults = new Headers([["x-default", "a"]]);
		const client = createStorageClient({
			fetch: fetchMock,
			headers: defaults,
		});

		await client.downloadUrl(
			{ key: "file" },
			{
				headers: [["x-request", "b"]],
			},
		);

		const call = fetchMock.mock.calls[0];
		const options = call?.[1] as RequestInit | undefined;
		const headers = new Headers(options?.headers);
		expect(headers.get("x-default")).toBe("a");
		expect(headers.get("x-request")).toBe("b");
	});
});

describe("server-inferred metadata", () => {
	it("validates metadata using schema from server config", async () => {
		const schema = createSchema();
		const storage = createStorage({
			bucket: "test",
			adapter,
			metadataSchema: schema,
		});
		const fetchMock = vi.fn();
		const client = createStorageClientFromServer(storage, {
			fetch: fetchMock,
			validateMetadata: true,
		});

		await expect(
			client.uploadUrl({
				file: { name: "a.txt", size: 1, contentType: "text/plain" },
				metadata: {} as any,
			}),
		).rejects.toBeInstanceOf(MetadataValidationError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("uses schema output when metadata is valid", async () => {
		const schema = createSchema();
		const storage = createStorage({
			bucket: "test",
			adapter,
			metadataSchema: schema,
		});
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ uploadUrl: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const client = createStorageClientFromServer(storage, {
			fetch: fetchMock,
			validateMetadata: true,
		});

		const result = await client.uploadUrl({
			file: { name: "a.txt", size: 1, contentType: "text/plain" },
			metadata: { userId: "123" },
		});

		expect(result.uploadUrl).toBe("ok");
	});
});
