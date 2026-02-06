import z from "zod";
import { StorageErrorCode } from "../../core/error/codes";
import { StorageServerError } from "../../core/error/error";
import {
	type FileValidationIssue,
	getObjectKeyValidationIssue,
} from "../../core/validation";
import type { PresignedDownloadResult } from "../../types/adapter";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { routeRegistry } from "../registry";

function normalizePresignedDownload(result: PresignedDownloadResult): {
	url: string;
	headers?: Record<string, string>;
} {
	if (typeof result === "string") {
		return { url: result };
	}
	return result;
}

function throwIfKeyInvalid(issue: FileValidationIssue | null): void {
	if (issue) {
		throw new StorageServerError(issue);
	}
}

type DownloadUrlResponse = {
	presignedUrl: string;
	downloadHeaders?: Record<string, string>;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type
// is inferred from createStorageEndpoint which produces a complex StrictEndpoint overload
// union. Spelling it out manually is not feasible without duplicating better-call internals.
export function createDownloadUrlRoute<M extends StandardSchemaV1>(
	metadataSchema?: M,
) {
	const schemas = routeRegistry["/download-url"];

	return createStorageEndpoint(
		"/download-url",
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

			const { adapter, hooks } = ctx.context.$options;
			const { key, expiresIn, encryption } = ctx.body;

			throwIfKeyInvalid(getObjectKeyValidationIssue(key));

			if (hooks?.beforeDownload) {
				const hookResult = await hooks.beforeDownload(key);
				if (!hookResult.success) {
					throw new StorageServerError({
						code: StorageErrorCode.FORBIDDEN,
						message: hookResult.reason ?? "Download rejected by hook.",
						details: { key },
					});
				}
			}

			const exists = await adapter.objectExists(key);
			if (!exists) {
				throw new StorageServerError({
					code: StorageErrorCode.NOT_FOUND,
					message: "Object not found.",
					details: { key },
				});
			}

			const presigned = await adapter.generatePresignedDownloadUrl(key, {
				expiresIn,
				encryption,
			});

			const { url, headers } = normalizePresignedDownload(presigned);

			if (hooks?.afterDownload) {
				await hooks.afterDownload(key);
			}

			const response: DownloadUrlResponse = {
				presignedUrl: url,
			};

			if (headers && Object.keys(headers).length > 0) {
				response.downloadHeaders = headers;
			}

			return response;
		},
	);
}
