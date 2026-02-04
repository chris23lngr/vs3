import { createFetch } from "@better-fetch/fetch";
import z from "zod";
import { DEFAULT_API_PATH, DEFAULT_BASE_URL } from "../core/consts";
import type { StandardSchemaV1 } from "../types/standard-schema";
import { createFetchSchema } from "./fetch-schema";
import type { StorageClientOptions } from "./types";

type BaseClientFunctionOptions = {
	onError?: (error: unknown) => void;
	onSuccess?: (data: unknown) => void;
};

export function createBaseClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
	O extends StorageClientOptions<M> = StorageClientOptions<M>,
>(options: O) {
	const { baseURL = DEFAULT_BASE_URL, apiPath = DEFAULT_API_PATH } = options;

	const apiUrl = new URL(apiPath, baseURL);

	const $fetch = createFetch({
		baseURL: apiUrl.toString(),
		customFetchImpl: fetch,
		schema: createFetchSchema(options),
		errorSchema: z.object({
			message: z.string(),
		}),
	});

	return {
		$fetch,
		uploadFile: async (
			file: File,
			metadata: StandardSchemaV1.InferInput<NonNullable<O["metadataSchema"]>>,
		) => {
			try {
				const response = await $fetch("/generate-upload-url", {
					body: {
						file: {
							contentType: file.type,
							name: file.name,
							size: file.size,
						},
						metadata,
					},
				});

				if (response.error) {
					return {};
				}
			} catch (error) {
				console.error(error);
				throw error;
			}
		},
	};
}
