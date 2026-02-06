import { createFetch } from "@better-fetch/fetch";
import z from "zod";
import { DEFAULT_API_PATH, DEFAULT_BASE_URL } from "../core/consts";
import { StorageErrorCode } from "../core/error/codes";
import {
	errorSchema,
	StorageClientError,
	StorageError,
	StorageServerError,
} from "../core/error/error";
import { formatFileSize } from "../core/utils/format-file-size";
import {
	type FileValidationIssue,
	getAllowedFileTypesConfigIssue,
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getMagicByteLength,
} from "../core/validation/file-validator";
import type { S3Encryption } from "../types/encryption";
import type { FileInfo } from "../types/file";
import type { StandardSchemaV1 } from "../types/standard-schema";
import {
	extractFileName,
	openInBrowserTab,
	triggerBrowserDownload,
} from "./browser/download";
import { createFetchSchema } from "./fetch-schema";
import type { StorageClientOptions } from "./types";
import { xhrUpload } from "./xhr/upload";

/**
 * Download mode for the client.
 *
 * - `"url"` — returns the presigned URL only (default)
 * - `"direct-download"` — fetches the file and triggers a browser download
 * - `"preview"` — opens the file in a new browser tab
 */
export type DownloadMode = "url" | "direct-download" | "preview";

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
	uploadHeaders: z.record(z.string(), z.string()).optional(),
});

const downloadUrlResponseSchema = z.object({
	presignedUrl: z.string(),
	downloadHeaders: z.record(z.string(), z.string()).optional(),
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
	encryption: S3Encryption | undefined,
	onProgress: ((progress: number) => void) | undefined,
	retry: undefined | true | number,
): Promise<UploadFileResult> {
	const body = encryption
		? { fileInfo, metadata, encryption }
		: { fileInfo, metadata };

	const response = await $fetch("/upload-url", {
		body,
	});

	if (response.error) {
		const parsed = errorSchema.safeParse(response.error);
		if (parsed.success) {
			const ErrorClass =
				parsed.data.origin === "server" ? StorageServerError : StorageClientError;
			throw new ErrorClass({
				code: parsed.data.code,
				message: parsed.data.message,
				details: parsed.data.details,
				httpStatus: parsed.data.httpStatus,
				recoverySuggestion: parsed.data.recoverySuggestion,
			});
		}
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

	const { key, presignedUrl, uploadHeaders } = parsedResponse.data;
	const uploadResult = await xhrUpload(presignedUrl, file, {
		onProgress,
		retry,
		headers: uploadHeaders ?? {},
	});

	const result: UploadFileResult = {
		key,
		presignedUrl,
		uploadUrl: uploadResult.uploadUrl,
		status: uploadResult.status,
		statusText: uploadResult.statusText,
	};

	if (uploadHeaders && Object.keys(uploadHeaders).length > 0) {
		result.uploadHeaders = uploadHeaders;
	}

	return result;
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

type DownloadRequestInput = {
	key: string;
	expiresIn: number | undefined;
	encryption: S3Encryption | undefined;
};

async function executeDownloadRequest(
	$fetch: ReturnType<typeof createFetch>,
	input: DownloadRequestInput,
): Promise<DownloadFileResult> {
	const body: { key: string; expiresIn?: number; encryption?: S3Encryption } = {
		key: input.key,
	};
	if (input.expiresIn !== undefined) {
		body.expiresIn = input.expiresIn;
	}
	if (input.encryption !== undefined) {
		body.encryption = input.encryption;
	}

	const response = await $fetch("/download-url", { body });

	if (response.error) {
		const parsed = errorSchema.safeParse(response.error);
		if (parsed.success) {
			const ErrorClass =
				parsed.data.origin === "server" ? StorageServerError : StorageClientError;
			throw new ErrorClass({
				code: parsed.data.code,
				message: parsed.data.message,
				details: parsed.data.details,
				httpStatus: parsed.data.httpStatus,
				recoverySuggestion: parsed.data.recoverySuggestion,
			});
		}
		throw new StorageClientError({
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: `${response.error.status}: ${response.error.message ?? "Unknown error"}`,
			message: response.error.message ?? "Unknown error",
		});
	}

	const parsedResponse = downloadUrlResponseSchema.safeParse(response.data);
	if (!parsedResponse.success) {
		throw new StorageClientError({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid download URL response.",
			details: parsedResponse.error.flatten().fieldErrors,
		});
	}

	const result: DownloadFileResult = {
		presignedUrl: parsedResponse.data.presignedUrl,
	};

	if (
		parsedResponse.data.downloadHeaders &&
		Object.keys(parsedResponse.data.downloadHeaders).length > 0
	) {
		result.downloadHeaders = parsedResponse.data.downloadHeaders;
	}

	return result;
}

function dispatchDownloadMode(
	mode: DownloadMode | undefined,
	result: DownloadFileResult,
	key: string,
): Promise<void> | void {
	if (mode === "direct-download") {
		return triggerBrowserDownload(
			result.presignedUrl,
			extractFileName(key),
			result.downloadHeaders,
		);
	}
	if (mode === "preview") {
		openInBrowserTab(result.presignedUrl);
	}
}

function handleDownloadError(
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
			error instanceof Error
				? error.message
				: "Download URL request failed unexpectedly",
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
	/** Headers applied to the upload request, if any */
	uploadHeaders?: Record<string, string>;
};

/**
 * Result returned from downloadFile operation.
 */
export type DownloadFileResult = {
	/** The presigned URL for downloading the file */
	presignedUrl: string;
	/** Headers to include when fetching the presigned URL, if any */
	downloadHeaders?: Record<string, string>;
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
		"~options": options,
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
					encryption?: S3Encryption;
				}
			>,
		): Promise<UploadFileResult> => {
			const { onError, onSuccess, onProgress, encryption, retry } = options ?? {};
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
					encryption,
					onProgress,
					retry,
				);
				onSuccess?.(result);
				return result;
			} catch (error) {
				handleUploadError(error, onError);
			}
		},

		/**
		 * Gets a presigned download URL for a file in storage.
		 *
		 * @param key - The key/path of the file to download
		 * @param options - Download options including callbacks and encryption
		 * @returns Download result containing the presigned URL and optional headers
		 *
		 * @example
		 * ```typescript
		 * const result = await client.downloadFile("uploads/photo.png");
		 * window.location.href = result.presignedUrl;
		 * ```
		 */
		downloadFile: async (
			key: string,
			options?: Partial<{
				expiresIn: number;
				encryption: S3Encryption;
				mode: DownloadMode;
				onError: (error: StorageError) => void;
				onSuccess: (result: DownloadFileResult) => void;
			}>,
		): Promise<DownloadFileResult> => {
			const { expiresIn, encryption, mode, onError, onSuccess } = options ?? {};

			try {
				const result = await executeDownloadRequest($fetch, {
					key,
					expiresIn,
					encryption,
				});
				await dispatchDownloadMode(mode, result, key);
				onSuccess?.(result);
				return result;
			} catch (error) {
				handleDownloadError(error, onError);
			}
		},
	};
}

export type BaseStorageClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
	O extends StorageClientOptions<M> = StorageClientOptions<M>,
> = ReturnType<typeof createBaseClient<M, O>>;
