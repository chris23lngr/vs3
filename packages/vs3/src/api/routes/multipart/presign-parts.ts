import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import { getObjectKeyValidationIssue } from "../../../core/validation";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import { createStorageEndpoint } from "../../create-storage-endpoint";
import { routeRegistry } from "../../registry";
import { throwIfIssue, validateContext } from "../shared/upload-validation";

function isNoSuchUploadError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const err = error as Record<string, unknown>;
	return err.name === "NoSuchUpload" || err.Code === "NoSuchUpload";
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
			const { key, uploadId, parts } = ctx.body;

			throwIfIssue(getObjectKeyValidationIssue(key));

			try {
				const presignedParts = await Promise.all(
					parts.map(async (part) => {
						const presignedUrl = await operations.presignUploadPart({
							key,
							uploadId,
							partNumber: part.partNumber,
						});
						return { partNumber: part.partNumber, presignedUrl };
					}),
				);

				return { parts: presignedParts };
			} catch (error) {
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
