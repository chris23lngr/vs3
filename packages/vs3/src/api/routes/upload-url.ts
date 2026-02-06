import z from "zod";
import { generateObjectKey } from "../../adapters/utils";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { formatFileSize } from "../../core/utils/format-file-size";
import {
	type FileValidationIssue,
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getObjectKeyValidationIssue,
	runContentValidators,
} from "../../core/validation";
import type { PresignedUploadResult } from "../../types/adapter";
import type { FileInfo } from "../../types/file";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import type { ContentValidatorInput } from "../../types/validation";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { routeRegistry } from "../registry";

/**
 * Validates file size against configured maximum.
 * @throws {StorageServerError} If file exceeds size limit
 */
function validateFileSize(
	fileInfo: FileInfo,
	maxFileSize: number | undefined,
): void {
	if (maxFileSize !== undefined && fileInfo.size > maxFileSize) {
		throw new StorageServerError({
			code: StorageErrorCode.FILE_TOO_LARGE,
			message: `File size ${formatFileSize(fileInfo.size)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)} (${maxFileSize} bytes).`,
			details: {
				fileSize: fileInfo.size,
				maxFileSize,
				fileName: fileInfo.name,
			},
		});
	}
}

function throwIfIssue(issue: FileValidationIssue | null): void {
	if (issue) {
		throw new StorageServerError(issue);
	}
}

type RunCustomValidatorsOptions<TMetadata> = {
	fileInfo: FileInfo;
	metadata: TMetadata;
	validators: ContentValidatorInput<TMetadata>[] | undefined;
	timeoutMs: number | undefined;
};

/**
 * Runs custom content validators if configured.
 * @throws {StorageServerError} If any validator fails
 */
async function runCustomValidators<TMetadata>(
	options: RunCustomValidatorsOptions<TMetadata>,
): Promise<void> {
	const { fileInfo, metadata, validators, timeoutMs } = options;
	if (!validators || validators.length === 0) {
		return;
	}

	const result = await runContentValidators({
		validators,
		context: { fileInfo, metadata },
		timeoutMs,
	});

	if (!result.valid && result.failure) {
		const validatorName = result.failure.validatorName
			? ` (${result.failure.validatorName})`
			: "";

		throw new StorageServerError({
			code: StorageErrorCode.CONTENT_VALIDATION_ERROR,
			message: `Content validation failed${validatorName}: ${result.failure.reason}`,
			details: {
				validatorName: result.failure.validatorName,
				validatorIndex: result.failure.validatorIndex,
				reason: result.failure.reason,
				fileName: fileInfo.name,
			},
		});
	}
}

/**
 * Parses and validates metadata using the provided schema.
 * @returns Parsed metadata value
 * @throws {StorageServerError} If metadata validation fails
 */
async function parseMetadata<M extends StandardSchemaV1>(
	schema: M | undefined,
	data: unknown,
): Promise<unknown> {
	if (!schema) {
		return {};
	}

	let parsedMetadata = schema["~standard"].validate(data);

	if (parsedMetadata instanceof Promise) {
		parsedMetadata = await parsedMetadata;
	}

	if (parsedMetadata.issues) {
		throw new StorageServerError({
			code: StorageErrorCode.METADATA_VALIDATION_ERROR,
			message: "Invalid metadata.",
			details: parsedMetadata.issues.map((issue) => issue.message).join(", "),
		});
	}

	return parsedMetadata.value;
}

/**
 * Transforms metadata object to string-valued entries for S3.
 */
function transformMetadata(
	metadata: unknown,
): Record<string, string> | undefined {
	if (!metadata || typeof metadata !== "object") {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(metadata as Record<string, unknown>).map(([key, value]) => [
			key,
			value == null ? "" : String(value),
		]),
	);
}

function normalizePresignedUpload(result: PresignedUploadResult): {
	url: string;
	headers?: Record<string, string>;
} {
	if (typeof result === "string") {
		return { url: result };
	}
	return result;
}

export function createUploadUrlRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/upload-url"];

	return createStorageEndpoint(
		"/upload-url",
		{
			method: "POST",
			metadataSchema: metadataSchema ?? z.undefined(),
			requireMetadata: schemas.requireMetadata,
			body: schemas.body,
			outputSchema: schemas.output,
		},
		async (ctx) => {
			if (
				ctx.context === null ||
				ctx.context === undefined ||
				ctx.context.$options === null ||
				ctx.context.$options === undefined
			) {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "Storage context is not available.",
					details:
						"Storage context or $options is missing. The endpoint was called without proper context injection. " +
						"Ensure you are using createStorage() and calling endpoints through the returned API, " +
						"not calling raw endpoint handlers directly.",
				});
			}

			const {
				adapter,
				generateKey,
				maxFileSize,
				contentValidators,
				contentValidatorTimeoutMs,
			} = ctx.context.$options;
			const { fileInfo, acl, expiresIn } = ctx.body;
			const { encryption } = ctx.body;

			throwIfIssue(getFileNameValidationIssue(fileInfo.name));

			validateFileSize(fileInfo, maxFileSize);

			throwIfIssue(
				getFileTypeValidationIssue({
					fileInfo,
					allowedFileTypes: ctx.context.$options.allowedFileTypes,
				}),
			);

			const internalMetadata = await parseMetadata(
				metadataSchema,
				ctx.body.metadata,
			);

			// Run custom content validators after built-in validations
			await runCustomValidators({
				fileInfo,
				metadata: internalMetadata,
				validators: contentValidators,
				timeoutMs: contentValidatorTimeoutMs,
			});

			const key = generateKey
				? await generateKey(fileInfo, internalMetadata)
				: generateObjectKey(fileInfo);

			throwIfIssue(getObjectKeyValidationIssue(key));

			const presigned = await adapter.generatePresignedUploadUrl(key, fileInfo, {
				expiresIn,
				contentType: fileInfo.contentType,
				metadata: transformMetadata(internalMetadata),
				acl,
				encryption,
			});

			const { url, headers } = normalizePresignedUpload(presigned);

			const response: {
				presignedUrl: string;
				key: string;
				uploadHeaders?: Record<string, string>;
			} = {
				presignedUrl: url,
				key,
			};

			if (headers && Object.keys(headers).length > 0) {
				response.uploadHeaders = headers;
			}

			return response;
		},
	);
}
