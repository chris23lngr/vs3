import { createFetch } from "@better-fetch/fetch";
import { DEFAULT_API_PATH, DEFAULT_BASE_URL } from "../core/consts";
import { StorageErrorCode } from "../core/error/codes";
import {
	errorSchema,
	StorageClientError,
	StorageError,
} from "../core/error/error";
import { formatFileSize } from "../core/utils/format-file-size";
import type { StandardSchemaV1 } from "../types/standard-schema";
import { createFetchSchema } from "./fetch-schema";
import type { StorageClientOptions } from "./types";
import { xhrUpload } from "./xhr/upload";

/**
 * Validates client options at configuration time.
 * @param maxFileSize - The maximum file size in bytes
 * @throws {StorageClientError} If maxFileSize is invalid
 */
function validateClientOptions(maxFileSize: number | undefined): void {
	if (maxFileSize === undefined) {
		return;
	}

	if (!Number.isFinite(maxFileSize)) {
		throw new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid maxFileSize configuration.",
			details: "maxFileSize must be a finite number.",
		});
	}

	if (maxFileSize <= 0) {
		throw new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid maxFileSize configuration.",
			details: "maxFileSize must be greater than 0.",
		});
	}
}

/**
 * Result returned from uploadFile operation.
 */
export type UploadFileResult = {
	/** The generated key/path for the uploaded file in storage */
	key: string;
	/** The presigned URL that was used for the upload */
	presignedUrl: string;
	/** The actual upload URL (may differ from presignedUrl) */
	uploadUrl: string;
	/** HTTP status code from the upload operation */
	status: number;
	/** HTTP status text from the upload operation */
	statusText: string;
};

type ClientFnOptions = {
	onError?: (error: StorageError) => void;
	onSuccess?: (result: UploadFileResult) => void;
};

export function createBaseClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
	O extends StorageClientOptions<M> = StorageClientOptions<M>,
>(options: O) {
	const { baseURL = DEFAULT_BASE_URL, apiPath = DEFAULT_API_PATH, maxFileSize } = options;

	validateClientOptions(maxFileSize);

	const apiUrl = new URL(apiPath, baseURL);

	const $fetch = createFetch({
		baseURL: apiUrl.toString(),
		customFetchImpl: fetch,
		schema: createFetchSchema(options),
		errorSchema: errorSchema,
	});

	return {
		$fetch,
		/**
		 * Uploads a file to storage using a presigned URL.
		 *
		 * @param file - The file to upload
		 * @param metadata - Metadata to associate with the file
		 * @param options - Upload options including callbacks and retry configuration
		 * @returns Upload result containing the key, URLs, and status information
		 *
		 * @example
		 * ```typescript
		 * const result = await client.uploadFile(file, { userId: "123" });
		 * console.log("Uploaded to:", result.key);
		 * console.log("Status:", result.status); // 200
		 * ```
		 */
		uploadFile: async (
			file: File,
			metadata: StandardSchemaV1.InferInput<NonNullable<O["metadataSchema"]>>,
			options?: Partial<
				ClientFnOptions & {
					retry?: undefined | true | number;
					onProgress?: (progress: number) => void;
					abort: () => void;
				}
			>,
		): Promise<UploadFileResult> => {
			const { onError, onSuccess, onProgress } = options ?? {};

			if (maxFileSize !== undefined && file.size > maxFileSize) {
				const error = new StorageClientError({
					code: StorageErrorCode.FILE_TOO_LARGE,
					message: `File size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)} (${maxFileSize} bytes).`,
					details: {
						fileSize: file.size,
						maxFileSize,
						fileName: file.name,
					},
				});
				onError?.(error);
				throw error;
			}

			try {
				const response = await $fetch("/upload-url", {
					body: {
						fileInfo: {
							contentType: file.type,
							name: file.name,
							size: file.size ?? 0,
						},
						metadata,
					},
				});

				if (response.error) {
					throw new StorageClientError({
						code: StorageErrorCode.UNKNOWN_ERROR,
						details: `${response.error.status}: ${response.error.message ?? "Unknown error"}`,
						message: response.error.message ?? "Unknown error",
					});
				}

				const { key, presignedUrl } = response.data;

				const uploadResult = await xhrUpload(presignedUrl, file, {
					onProgress,
				});

				const result: UploadFileResult = {
					key,
					presignedUrl,
					uploadUrl: uploadResult.uploadUrl,
					status: uploadResult.status,
					statusText: uploadResult.statusText,
				};

				onSuccess?.(result);
				return result;
			} catch (error) {
				if (error instanceof StorageError) {
					onError?.(error);
					throw error;
				}

				const storageError = new StorageClientError({
					code: StorageErrorCode.NETWORK_ERROR,
					message:
						error instanceof Error ? error.message : "Upload failed unexpectedly",
					details: error instanceof Error ? error.stack : String(error),
				});

				onError?.(storageError);
				throw storageError;
			}
		},
	};
}

export type BaseStorageClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
	O extends StorageClientOptions<M> = StorageClientOptions<M>,
> = ReturnType<typeof createBaseClient<M, O>>;
