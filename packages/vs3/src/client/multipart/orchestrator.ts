import type { createFetch } from "@better-fetch/fetch";
import z from "zod";
import { StorageErrorCode } from "../../core/error/codes";
import {
	errorSchema,
	StorageClientError,
	StorageServerError,
} from "../../core/error/error";
import type { MultipartUploadPart } from "../../internal/s3-operations.types";
import type { S3Encryption } from "../../types/encryption";
import { type XhrUploadPartResult, xhrUploadPart } from "../xhr/upload-part";

const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_CONCURRENCY = 4;
const PRESIGN_BATCH_SIZE = 10;

export type MultipartUploadOptions = {
	partSize?: number;
	concurrency?: number;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
	retry?: undefined | true | number;
	encryption?: S3Encryption;
};

export type MultipartUploadResult = {
	key: string;
	uploadId: string;
	totalParts: number;
};

type PresignedPart = {
	partNumber: number;
	presignedUrl: string;
	uploadHeaders?: Record<string, string>;
};

type OrchestratorParams = {
	$fetch: ReturnType<typeof createFetch>;
	file: File;
	metadata: unknown;
	options: MultipartUploadOptions;
};

const createResponseSchema = z.object({
	uploadId: z.string().min(1),
	key: z.string().min(1),
});

const presignedPartsResponseSchema = z.object({
	parts: z.array(
		z.object({
			partNumber: z.number().int().min(1),
			presignedUrl: z.string().min(1),
			uploadHeaders: z.record(z.string(), z.string()).optional(),
		}),
	),
});

function parseFetchError(error: unknown, fallbackMessage: string): never {
	const parsed = errorSchema.safeParse(error);

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

	const details =
		error !== undefined
			? error
			: "Multipart endpoint returned an error payload with no details.";
	throw new StorageClientError({
		code: StorageErrorCode.UNKNOWN_ERROR,
		message: fallbackMessage,
		details,
	});
}

function validateMultipartOptions(options: MultipartUploadOptions): {
	partSize: number;
	concurrency: number;
} {
	const partSize = options.partSize ?? DEFAULT_PART_SIZE;
	if (!Number.isInteger(partSize) || partSize <= 0) {
		throw new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid multipart partSize.",
			details: "partSize must be a positive integer.",
		});
	}

	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	if (!Number.isInteger(concurrency) || concurrency <= 0) {
		throw new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid multipart concurrency.",
			details: "concurrency must be a positive integer.",
		});
	}

	return { partSize, concurrency };
}

function ensureMultipartFileSupported(file: File): void {
	if (file.size <= 0) {
		throw new StorageClientError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Multipart upload requires a non-empty file.",
			details: { size: file.size, name: file.name },
		});
	}
}

function splitFileIntoParts(file: File, partSize: number): Blob[] {
	const parts: Blob[] = [];
	let offset = 0;
	while (offset < file.size) {
		parts.push(file.slice(offset, offset + partSize));
		offset += partSize;
	}
	return parts;
}

async function presignPartsBatch(
	$fetch: ReturnType<typeof createFetch>,
	key: string,
	uploadId: string,
	partNumbers: number[],
	options: MultipartUploadOptions,
): Promise<PresignedPart[]> {
	const response = await $fetch("/multipart/presign-parts", {
		signal: options.signal,
		body: {
			key,
			uploadId,
			parts: partNumbers.map((partNumber) => ({ partNumber })),
			...(options.encryption ? { encryption: options.encryption } : {}),
		},
	});

	if (response.error) {
		parseFetchError(response.error, "Failed to presign upload parts");
	}

	const parsed = presignedPartsResponseSchema.safeParse(response.data);
	if (!parsed.success) {
		throw new StorageClientError({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid multipart presign response.",
			details: parsed.error.flatten().fieldErrors,
		});
	}

	return parsed.data.parts;
}

type UploadPartsParams = {
	presignedParts: PresignedPart[];
	blobs: Blob[];
	concurrency: number;
	signal?: AbortSignal;
	retry?: undefined | true | number;
	onPartProgress: (partNumber: number, loaded: number) => void;
};

async function uploadPartsWithConcurrency(
	params: UploadPartsParams,
): Promise<XhrUploadPartResult[]> {
	const { presignedParts, blobs, concurrency, signal, retry, onPartProgress } =
		params;
	const results: XhrUploadPartResult[] = [];
	let index = 0;

	async function processNext(): Promise<void> {
		while (index < presignedParts.length) {
			const current = index++;
			const part = presignedParts[current];
			const blob = blobs[part.partNumber - 1];
			if (!blob) {
				throw new StorageClientError({
					code: StorageErrorCode.INVALID_PARTS,
					message: "Presigned partNumber does not match upload part list.",
					details: { partNumber: part.partNumber, totalParts: blobs.length },
				});
			}

			const result = await xhrUploadPart(
				{
					presignedUrl: part.presignedUrl,
					partNumber: part.partNumber,
					body: blob,
					headers: part.uploadHeaders,
					signal,
					onProgress: (loaded) => onPartProgress(part.partNumber, loaded),
				},
				{ retry },
			);

			results.push(result);
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, presignedParts.length) },
		() => processNext(),
	);

	await Promise.all(workers);
	return results;
}

async function abortUpload(
	$fetch: ReturnType<typeof createFetch>,
	key: string,
	uploadId: string,
): Promise<void> {
	try {
		await $fetch("/multipart/abort", { body: { key, uploadId } });
	} catch {
		// Best-effort abort — S3 lifecycle policies handle cleanup
	}
}

export async function executeMultipartUpload(
	params: OrchestratorParams,
): Promise<MultipartUploadResult> {
	const { $fetch, file, metadata, options } = params;
	ensureMultipartFileSupported(file);
	const { partSize, concurrency } = validateMultipartOptions(options);

	const body = options.encryption
		? {
				fileInfo: { name: file.name, size: file.size, contentType: file.type },
				metadata,
				encryption: options.encryption,
			}
		: {
				fileInfo: { name: file.name, size: file.size, contentType: file.type },
				metadata,
			};

	const createResponse = await $fetch("/multipart/create", {
		signal: options.signal,
		body,
	});
	if (createResponse.error) {
		parseFetchError(createResponse.error, "Failed to create multipart upload");
	}

	const parsedCreateResponse = createResponseSchema.safeParse(
		createResponse.data,
	);
	if (!parsedCreateResponse.success) {
		throw new StorageClientError({
			code: StorageErrorCode.UNKNOWN_ERROR,
			message: "Invalid multipart create response.",
			details: parsedCreateResponse.error.flatten().fieldErrors,
		});
	}
	const { uploadId, key } = parsedCreateResponse.data;

	const blobs = splitFileIntoParts(file, partSize);
	const totalParts = blobs.length;
	const allPartNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);

	const partProgress = new Map<number, number>();
	const totalSize = file.size;

	function reportProgress(): void {
		if (!options.onProgress) return;
		let loaded = 0;
		for (const bytes of partProgress.values()) {
			loaded += bytes;
		}
		options.onProgress(Math.min(loaded / totalSize, 1));
	}

	try {
		// Presign in batches
		const allPresignedParts: PresignedPart[] = [];
		for (let i = 0; i < allPartNumbers.length; i += PRESIGN_BATCH_SIZE) {
			const batch = allPartNumbers.slice(i, i + PRESIGN_BATCH_SIZE);
			const presigned = await presignPartsBatch(
				$fetch,
				key,
				uploadId,
				batch,
				options,
			);
			allPresignedParts.push(...presigned);
		}

		// Upload with concurrency
		const completedParts = await uploadPartsWithConcurrency({
			presignedParts: allPresignedParts,
			blobs,
			concurrency,
			signal: options.signal,
			retry: options.retry,
			onPartProgress: (partNumber, loaded) => {
				partProgress.set(partNumber, loaded);
				reportProgress();
			},
		});

		// Complete
		const parts: MultipartUploadPart[] = completedParts
			.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag }))
			.sort((a, b) => a.partNumber - b.partNumber);

		const completeResponse = await $fetch("/multipart/complete", {
			signal: options.signal,
			body: { key, uploadId, parts },
		});

		if (completeResponse.error) {
			parseFetchError(
				completeResponse.error,
				"Failed to complete multipart upload",
			);
		}

		return { key, uploadId, totalParts };
	} catch (error) {
		await abortUpload($fetch, key, uploadId);
		throw error;
	}
}
