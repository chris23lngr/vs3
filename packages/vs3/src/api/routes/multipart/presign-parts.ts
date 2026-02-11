import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import { getObjectKeyValidationIssue } from "../../../core/validation";
import type { PresignedUrlResult } from "../../../internal/s3-operations.types";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import { createStorageEndpoint } from "../../create-storage-endpoint";
import { routeRegistry } from "../../registry";
import { throwIfIssue, validateContext } from "../shared/upload-validation";

function isNoSuchUploadError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const err = error as Record<string, unknown>;
	return err.name === "NoSuchUpload" || err.Code === "NoSuchUpload";
}

function normalizePresignedPart(
	partNumber: number,
	result: PresignedUrlResult,
): {
	partNumber: number;
	presignedUrl: string;
	uploadHeaders?: Record<string, string>;
} {
	if (typeof result === "string") {
		return { partNumber, presignedUrl: result };
	}

	return {
		partNumber,
		presignedUrl: result.url,
		uploadHeaders: result.headers,
	};
}

export function createMultipartPresignPartsRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/multipart/presign-parts"];

	return createStorageEndpoint(
		"/multipart/presign-parts",
		{
			method: "POST",
			metadataSchema: metadataSchema ?? z.undefined(),
			requireMetadata: schemas.requireMetadata,
			body: schemas.body,
			outputSchema: schemas.output,
		},
		async (ctx) => {
			validateContext(ctx);

			const operations = ctx.context.$operations;
			const { key, uploadId, parts, encryption } = ctx.body;

			throwIfIssue(getObjectKeyValidationIssue(key));

			try {
				const presignedParts = await Promise.all(
					parts.map(async (part) => {
						const input = {
							key,
							uploadId,
							partNumber: part.partNumber,
						};
						const result = encryption
							? await operations.presignUploadPart(input, { encryption })
							: await operations.presignUploadPart(input);
						return normalizePresignedPart(part.partNumber, result);
					}),
				);

				return { parts: presignedParts };
			} catch (error) {
				if (error instanceof StorageServerError) {
					throw error;
				}
				if (isNoSuchUploadError(error)) {
					throw new StorageServerError({
						code: StorageErrorCode.MULTIPART_UPLOAD_NOT_FOUND,
						message: "Multipart upload not found or expired.",
						details: { key, uploadId },
					});
				}
				throw new StorageServerError({
					code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
					message: "Failed to presign upload parts.",
					details: {
						key,
						uploadId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		},
	);
}
