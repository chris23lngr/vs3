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

export function createMultipartCompleteRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/multipart/complete"];

	return createStorageEndpoint(
		"/multipart/complete",
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

			if (parts.length === 0) {
				throw new StorageServerError({
					code: StorageErrorCode.INVALID_PARTS,
					message: "Parts list must not be empty.",
					details: { key, uploadId },
				});
			}

			try {
				await operations.completeMultipartUpload({
					key,
					uploadId,
					parts,
				});

				return { key };
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
					message: "Failed to complete multipart upload.",
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
