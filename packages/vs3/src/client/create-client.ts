import { createFetch } from "@better-fetch/fetch";
import z from "zod";
import { DEFAULT_API_PATH, DEFAULT_BASE_URL } from "../core/consts";
import { StorageErrorCode } from "../core/error/codes";
import {
	errorSchema,
	StorageClientError,
	StorageError,
} from "../core/error/error";
import { formatFileSize } from "../core/utils/format-file-size";
import {
	type FileValidationIssue,
	getAllowedFileTypesConfigIssue,
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getMagicByteLength,
} from "../core/validation/file-validator";
import type { FileInfo } from "../types/file";
import type { StandardSchemaV1 } from "../types/standard-schema";
import { createFetchSchema } from "./fetch-schema";
import type { StorageClientOptions } from "./types";
import { xhrUpload } from "./xhr/upload";

type ClientValidationOptions = {
	maxFileSize: number | undefined;
	allowedFileTypes: string[] | undefined;
};

type UploadValidationInput = {
	file: File;
	maxFileSize: number | undefined;
	allowedFileTypes: string[] | undefined;
	onError?: (error: StorageError) => void;
};

type UploadValidationResult = {
	fileInfo: FileInfo;
};

const uploadUrlResponseSchema = z.object({
	key: z.string(),
	presignedUrl: z.string(),
});

function createClientValidationError(
	issue: FileValidationIssue,
): StorageClientError {
	return new StorageClientError(issue);
}

async function readMagicBytes(file: File): Promise<Uint8Array | undefined> {
	const maxBytes = Math.min(file.size, getMagicByteLength());
	if (maxBytes === 0) {
		return undefined;
	}
	const buffer = await file.slice(0, maxBytes).arrayBuffer();
	return new Uint8Array(buffer);
}

function failValidation(
	error: StorageClientError,
	onError?: (error: StorageError) => void,
): never {
	onError?.(error);
	throw error;
}

function buildFileInfo(file: File): FileInfo {
	return {
		contentType: file.type,
		name: file.name,
		size: file.size,
	};
}

function validateFileSizeForClient(
	file: File,
	maxFileSize: number | undefined,
	onError?: (error: StorageError) => void,
): void {
	if (maxFileSize === undefined || file.size <= maxFileSize) {
		return;
	}

	const error = new StorageClientError({
		code: StorageErrorCode.FILE_TOO_LARGE,
		message: `File size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)} (${maxFileSize} bytes).`,
		details: {
			fileSize: file.size,
			maxFileSize,
			fileName: file.name,
		},
	});

	failValidation(error, onError);
}

function validateFileNameForClient(
	fileName: string,
	onError?: (error: StorageError) => void,
): void {
	const nameIssue = getFileNameValidationIssue(fileName);
	if (nameIssue) {
		failValidation(createClientValidationError(nameIssue), onError);
	}
}

async function readFileBytesForValidation(
	file: File,
	allowedFileTypes: string[] | undefined,
	onError?: (error: StorageError) => void,
): Promise<Uint8Array | undefined> {
	if (!allowedFileTypes) {
		return undefined;
	}

	try {
		return await readMagicBytes(file);
	} catch (error) {
		const storageError = new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message:
				"Failed to read file for type validation. The file may be inaccessible or corrupted.",
			details: {
				fileName: file.name,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		failValidation(storageError, onError);
	}
}

function validateFileTypeForClient(
	fileInfo: FileInfo,
	allowedFileTypes: string[] | undefined,
	fileBytes: Uint8Array | undefined,
	onError?: (error: StorageError) => void,
): void {
	const fileTypeIssue = getFileTypeValidationIssue({
		fileInfo,
		allowedFileTypes,
		fileBytes,
	});
	if (fileTypeIssue) {
		failValidation(createClientValidationError(fileTypeIssue), onError);
	}
}

async function executeUploadRequest<M extends StandardSchemaV1>(
	$fetch: ReturnType<typeof createFetch>,
	file: File,
	fileInfo: FileInfo,
	metadata: StandardSchemaV1.InferInput<M>,
	onProgress?: (progress: number) => void,
): Promise<UploadFileResult> {
	const response = await $fetch("/upload-url", {
		body: {
			fileInfo,
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

	const parsedResponse = uploadUrlResponseSchema.safeParse(response.data);
	if (!parsedResponse.success) {
		throw new StorageClientError({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid upload URL response.",
			details: parsedResponse.error.flatten().fieldErrors,
		});
	}

	const { key, presignedUrl } = parsedResponse.data;
	const uploadResult = await xhrUpload(presignedUrl, file, {
		onProgress,
	});

	return {
		key,
		presignedUrl,
		uploadUrl: uploadResult.uploadUrl,
		status: uploadResult.status,
		statusText: uploadResult.statusText,
	};
}

function handleUploadError(
	error: unknown,
	onError?: (error: StorageError) => void,
): never {
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

async function validateUploadFileInput(
	input: UploadValidationInput,
): Promise<UploadValidationResult> {
	const fileInfo = buildFileInfo(input.file);

	validateFileSizeForClient(input.file, input.maxFileSize, input.onError);
	validateFileNameForClient(fileInfo.name, input.onError);

	const fileBytes = await readFileBytesForValidation(
		input.file,
		input.allowedFileTypes,
		input.onError,
	);
	validateFileTypeForClient(
		fileInfo,
		input.allowedFileTypes,
		fileBytes,
		input.onError,
	);

	return {
		fileInfo,
	};
}

/**
 * Validates client options at configuration time.
 * @throws {StorageClientError} If maxFileSize or allowedFileTypes are invalid
 */
function validateClientOptions(options: ClientValidationOptions): void {
	if (options.maxFileSize !== undefined) {
		if (!Number.isFinite(options.maxFileSize)) {
			throw new StorageClientError({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid maxFileSize configuration.",
				details: "maxFileSize must be a finite number.",
			});
		}

		if (options.maxFileSize <= 0) {
			throw new StorageClientError({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid maxFileSize configuration.",
				details: "maxFileSize must be greater than 0.",
			});
		}
	}

	const allowedFileTypesIssue = getAllowedFileTypesConfigIssue(
		options.allowedFileTypes,
	);
	if (allowedFileTypesIssue) {
		throw createClientValidationError(allowedFileTypesIssue);
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
	const {
		baseURL = DEFAULT_BASE_URL,
		apiPath = DEFAULT_API_PATH,
		maxFileSize,
		allowedFileTypes,
	} = options;

	validateClientOptions({ maxFileSize, allowedFileTypes });

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
			const { fileInfo } = await validateUploadFileInput({
				file,
				maxFileSize,
				allowedFileTypes,
				onError,
			});

			try {
				const result = await executeUploadRequest<NonNullable<O["metadataSchema"]>>(
					$fetch,
					file,
					fileInfo,
					metadata,
					onProgress,
				);
				onSuccess?.(result);
				return result;
			} catch (error) {
				handleUploadError(error, onError);
			}
		},
	};
}

export type BaseStorageClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
	O extends StorageClientOptions<M> = StorageClientOptions<M>,
> = ReturnType<typeof createBaseClient<M, O>>;
