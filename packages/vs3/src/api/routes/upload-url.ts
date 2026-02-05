import z from "zod";
import { generateObjectKey } from "../../adapters/utils";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { routeRegistry } from "../registry";

export function createUploadUrlRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/upload-url"];

	return createStorageEndpoint(
		"/upload-url",
		{
			method: "POST",
			metadataSchema: metadataSchema ?? z.undefined(),
			body: schemas.body,
			outputSchema: schemas.output,
		},
		async (ctx) => {
			console.log("Request received", ctx);

			if (ctx.context.$options === undefined) {
				throw new StorageServerError({
					code: StorageErrorCode.INTERNAL_SERVER_ERROR,
					message: "Router context is not available.",
					details:
						"Unable to access the context options from the router. Config was likely not passed to the router.",
				});
			}

			const { adapter, metadataSchema, generateKey } = ctx.context.$options;
			const { fileInfo, acl, expiresIn } = ctx.body;

			let internalMetdata: unknown = {};

			if (metadataSchema) {
				let parsedMetadata = metadataSchema["~standard"].validate(
					ctx.body.metadata,
				);

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

				internalMetdata = parsedMetadata.value;
			}

			const key = generateKey
				? await generateKey(fileInfo, internalMetdata)
				: generateObjectKey(fileInfo);

			const url = await adapter.generatePresignedUploadUrl(key, fileInfo, {
				expiresIn,
				contentType: fileInfo.contentType,
				// TODO: Safely parse metadata from the request body and turn it into a record of string values
				// metadata: internalMetdata,
				acl,
			});

			return {
				presignedUrl: url,
				key,
			};
		},
	);
}
