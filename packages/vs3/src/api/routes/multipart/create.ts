import z from "zod";
import { generateObjectKey } from "../../../adapters/utils";
import {
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getObjectKeyValidationIssue,
} from "../../../core/validation";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import { createStorageEndpoint } from "../../create-storage-endpoint";
import { routeRegistry } from "../../registry";
import {
	parseMetadata,
	runCustomValidators,
	throwIfIssue,
	transformMetadata,
	validateContext,
	validateFileSize,
} from "../shared/upload-validation";

export function createMultipartCreateRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/multipart/create"];

	return createStorageEndpoint(
		"/multipart/create",
		{
			method: "POST",
			metadataSchema: metadataSchema ?? z.undefined(),
			requireMetadata: schemas.requireMetadata,
			body: schemas.body,
			outputSchema: schemas.output,
		},
		async (ctx) => {
			validateContext(ctx);

			const {
				generateKey,
				maxFileSize,
				contentValidators,
				contentValidatorTimeoutMs,
			} = ctx.context.$options;
			const operations = ctx.context.$operations;
			const { fileInfo, acl, encryption } = ctx.body;

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

			const { uploadId } = await operations.createMultipartUpload(key, {
				contentType: fileInfo.contentType,
				metadata: transformMetadata(internalMetadata),
				acl,
				encryption,
			});

			return { uploadId, key };
		},
	);
}
