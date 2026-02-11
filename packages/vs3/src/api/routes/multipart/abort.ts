import z from "zod";
import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import { getObjectKeyValidationIssue } from "../../../core/validation";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import { createStorageEndpoint } from "../../create-storage-endpoint";
import { routeRegistry } from "../../registry";
import { throwIfIssue, validateContext } from "../shared/upload-validation";

export function createMultipartAbortRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/multipart/abort"];

	return createStorageEndpoint(
		"/multipart/abort",
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
			const { key, uploadId } = ctx.body;

			throwIfIssue(getObjectKeyValidationIssue(key));

			try {
				await operations.abortMultipartUpload(key, uploadId);
				return { success: true as const };
			} catch (error) {
				if (error instanceof StorageServerError) {
					throw error;
				}
				throw new StorageServerError({
					code: StorageErrorCode.MULTIPART_UPLOAD_FAILED,
					message: "Failed to abort multipart upload.",
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
