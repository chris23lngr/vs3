import z from "zod";
import { generateObjectKey } from "../../adapters/utils";
import {
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getObjectKeyValidationIssue,
} from "../../core/validation";
import type { PresignedUploadResult } from "../../internal/s3-operations.types";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { routeRegistry } from "../registry";
import {
	parseMetadata,
	runCustomValidators,
	throwIfIssue,
	transformMetadata,
	validateContext,
	validateFileSize,
} from "./shared/upload-validation";

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
			validateContext(ctx);

			const {
				generateKey,
				maxFileSize,
				contentValidators,
				contentValidatorTimeoutMs,
			} = ctx.context.$options;
			const operations = ctx.context.$operations;
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

			const presigned = await operations.generatePresignedUploadUrl(
				key,
				fileInfo,
				{
					expiresIn,
					contentType: fileInfo.contentType,
					metadata: transformMetadata(internalMetadata),
					acl,
					encryption,
				},
			);

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
