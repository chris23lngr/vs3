import { describe, expect, it } from "vitest";
import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";
import { getCurrentStorageContext } from "../context/endpoint-context";
import { toStorageEndpoints } from "./to-storage-endpoints";

type TestEndpoint = ((ctx: any) => Promise<any>) & {
	path: string;
	options: { method: "POST" };
};

const createStorageContext = (): StorageContext<StorageOptions> => ({
	$options: {
		bucket: "test-bucket",
		adapter: {
			generatePresignedUploadUrl: async () => "url",
			generatePresignedDownloadUrl: async () => "url",
			deleteObject: async () => {},
		},
	},
});

describe("toStorageEndpoints", () => {
	it("wraps endpoints and injects storage context", async () => {
		const endpoint: TestEndpoint = Object.assign(
			async (ctx: any) => {
				const current = await getCurrentStorageContext();
				return {
					path: ctx.path,
					hasOptions: Boolean(ctx.context?.$options),
					bucket: current.context.$options.bucket,
				};
			},
			{ path: "/upload-url", options: { method: "POST" as const } },
		);

		const storageContext = createStorageContext();
		const api = toStorageEndpoints({ uploadUrl: endpoint }, storageContext);

		const result = await api.uploadUrl({ body: { test: true } });

		expect(result).toEqual({
			path: "/upload-url",
			hasOptions: true,
			bucket: "test-bucket",
		});
	});

	it("converts incoming headers to Headers", async () => {
		const endpoint: TestEndpoint = Object.assign(
			async (ctx: any) => ({
				isHeaders: ctx.headers instanceof Headers,
				headerValue: ctx.headers?.get?.("x-test") ?? null,
			}),
			{ path: "/upload-url", options: { method: "POST" as const } },
		);

		const api = toStorageEndpoints(
			{ uploadUrl: endpoint },
			Promise.resolve(createStorageContext()),
		);

		const result = await api.uploadUrl({
			body: { test: true },
			headers: { "x-test": "ok" },
		});

		expect(result).toEqual({ isHeaders: true, headerValue: "ok" });
	});

	it("preserves endpoint path and options", () => {
		const endpoint: TestEndpoint = Object.assign(async () => null, {
			path: "/upload-url",
			options: { method: "POST" as const },
		});

		const api = toStorageEndpoints({ uploadUrl: endpoint }, createStorageContext());

		expect(api.uploadUrl.path).toBe("/upload-url");
		expect(api.uploadUrl.options).toEqual({ method: "POST" });
	});
});
