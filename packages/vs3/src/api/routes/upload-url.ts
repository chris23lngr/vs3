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
				metadata:
					internalMetdata && typeof internalMetdata === "object"
						? Object.fromEntries(
								Object.entries(internalMetdata as Record<string, unknown>).map(
									([key, value]) => [key, value == null ? "" : String(value)],
								),
							)
						: undefined,
				acl,
			});

			return {
				presignedUrl: url,
				key,
			};
		},
	);
}
