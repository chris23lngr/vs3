import z from "zod";
import { fileInfoSchema } from "../../schemas/file";
import type { StorageOptions } from "../../types/options";
import { normalizeMetadata, validateMetadata } from "../utils/metadata";
import { createRoute } from "../utils/route-builder";

/**
 * Upload route - simplified using route builder
 */
export function createUploadRoute<O extends StorageOptions>(options: O) {
	const fileSchema =
		typeof File !== "undefined" ? z.instanceof(File) : z.never();

	return createRoute(options, {
		path: "/generate-upload-url",
		method: "POST",
		bodySchema: z.object({
			file: z.union([fileSchema, fileInfoSchema]),
		}),
		requireMetadata: true, // Metadata required
		handler: async ({ body, context, endpoint }) => {
			const { file } = body;
			const metadataSchema = options.metadataSchema;
			const rawMetadata = body.metadata;

			if (metadataSchema && rawMetadata == null) {
				const message = "Metadata is required.";
				throw endpoint.error(400, {
					message,
					error: {
						code: "METADATA_INVALID",
						message,
					},
				});
			}

			const metadataResult = metadataSchema
				? await validateMetadata(metadataSchema, rawMetadata)
				: null;
			if (metadataResult && !metadataResult.ok) {
				const message = "Metadata validation failed.";
				throw endpoint.error(400, {
					message,
					error: {
						code: "METADATA_INVALID",
						message,
						details: metadataResult.issues,
					},
				});
			}
			const metadataOutput = metadataResult?.ok ? metadataResult.value : undefined;
			const metadata = normalizeMetadata(metadataOutput ?? rawMetadata);

			const fileInfo =
				typeof File !== "undefined" && file instanceof File
					? {
							name: file.name,
							size: file.size,
							contentType: file.type,
						}
					: file;

			if (options.maxFileSize != null && fileInfo.size > options.maxFileSize) {
				const message = "File size exceeds the maximum allowed size.";
				throw endpoint.error(400, {
					message,
					error: {
						code: "FILE_TOO_LARGE",
						message,
						details: { maxFileSize: options.maxFileSize },
					},
				});
			}

			if (options.allowedFileTypes?.length) {
				const allowed = options.allowedFileTypes.map((value) =>
					value.toLowerCase().trim(),
				);
				const contentType = fileInfo.contentType?.toLowerCase();
				const fileName = fileInfo.name.toLowerCase();
				const matches = allowed.some((entry) => {
					if (entry.includes("/")) {
						return contentType === entry;
					}
					const normalized = entry.startsWith(".") ? entry : `.${entry}`;
					return fileName.endsWith(normalized);
				});
				if (!matches) {
					const message = "File type is not allowed.";
					throw endpoint.error(400, {
						message,
						error: {
							code: "FILE_TYPE_NOT_ALLOWED",
							message,
							details: { allowedFileTypes: options.allowedFileTypes },
						},
					});
				}
			}

			const resolvedMetadata =
				metadataOutput ?? (rawMetadata as typeof metadataOutput);
			const key = options.generateKey
				? await options.generateKey(fileInfo, resolvedMetadata as any)
				: fileInfo.name;

			if (options.hooks?.beforeUpload) {
				const beforeResult = await options.hooks.beforeUpload(
					fileInfo,
					resolvedMetadata as any,
				);
				if (!beforeResult?.success) {
					const message = beforeResult?.reason ?? "Upload rejected.";
					throw endpoint.error(403, {
						message,
						error: {
							code: "BEFORE_UPLOAD_REJECTED",
							message,
						},
					});
				}
			}

			const adapter = context.$options.adapter;
			const uploadUrl = await adapter.generatePresignedUploadUrl(
				key,
				{
					name: fileInfo.name,
					size: fileInfo.size,
					contentType: fileInfo.contentType,
				},
				{
					contentType: fileInfo.contentType,
					metadata,
				},
			);

			if (options.hooks?.afterUpload) {
				await options.hooks.afterUpload(fileInfo, resolvedMetadata as any, key);
			}

			return { uploadUrl };
		},
	});
}
