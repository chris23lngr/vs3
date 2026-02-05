import z from "zod";
import { generateObjectKey } from "../../adapters/utils";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import { formatFileSize } from "../../core/utils/format-file-size";
import type { FileInfo } from "../../types/file";
import type { StandardSchemaV1 } from "../../types/standard-schema";
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
function transformMetadata(metadata: unknown): Record<string, string> | undefined {
	if (!metadata || typeof metadata !== "object") {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(metadata as Record<string, unknown>).map(
			([key, value]) => [key, value == null ? "" : String(value)],
		),
	);
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

			const { adapter, metadataSchema, generateKey, maxFileSize } = ctx.context.$options;
			const { fileInfo, acl, expiresIn } = ctx.body;

			validateFileSize(fileInfo, maxFileSize);

			const internalMetadata = await parseMetadata(metadataSchema, ctx.body.metadata);

			const key = generateKey
				? await generateKey(fileInfo, internalMetadata)
				: generateObjectKey(fileInfo);

			const url = await adapter.generatePresignedUploadUrl(key, fileInfo, {
				expiresIn,
				contentType: fileInfo.contentType,
				metadata: transformMetadata(internalMetadata),
				acl,
			});

			return {
				presignedUrl: url,
				key,
			};
		},
	);
}
