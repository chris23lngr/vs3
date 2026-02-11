import { StorageErrorCode } from "../../../core/error/codes";
import { StorageServerError } from "../../../core/error/error";
import { formatFileSize } from "../../../core/utils/format-file-size";
import {
	type FileValidationIssue,
	runContentValidators,
} from "../../../core/validation";
import type { FileInfo } from "../../../types/file";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type { ContentValidatorInput } from "../../../types/validation";

export function validateFileSize(
	fileInfo: FileInfo,
	maxFileSize: number | undefined,
): void {
	if (maxFileSize !== undefined && fileInfo.size > maxFileSize) {
		throw new StorageServerError({
			code: StorageErrorCode.FILE_TOO_LARGE,
			message: `File size ${formatFileSize(fileInfo.size)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)} (${maxFileSize} bytes).`,
			details: {
				fileSize: fileInfo.size,
				maxFileSize,
				fileName: fileInfo.name,
			},
		});
	}
}

export function throwIfIssue(issue: FileValidationIssue | null): void {
	if (issue) {
		throw new StorageServerError(issue);
	}
}

type RunCustomValidatorsOptions<TMetadata> = {
	fileInfo: FileInfo;
	metadata: TMetadata;
	validators: ContentValidatorInput<TMetadata>[] | undefined;
	timeoutMs: number | undefined;
};

export async function runCustomValidators<TMetadata>(
	options: RunCustomValidatorsOptions<TMetadata>,
): Promise<void> {
	const { fileInfo, metadata, validators, timeoutMs } = options;
	if (!validators || validators.length === 0) {
		return;
	}

	const result = await runContentValidators({
		validators,
		context: { fileInfo, metadata },
		timeoutMs,
	});

	if (!result.valid && result.failure) {
		const validatorName = result.failure.validatorName
			? ` (${result.failure.validatorName})`
			: "";

		throw new StorageServerError({
			code: StorageErrorCode.CONTENT_VALIDATION_ERROR,
			message: `Content validation failed${validatorName}: ${result.failure.reason}`,
			details: {
				validatorName: result.failure.validatorName,
				validatorIndex: result.failure.validatorIndex,
				reason: result.failure.reason,
				fileName: fileInfo.name,
			},
		});
	}
}

export async function parseMetadata<M extends StandardSchemaV1>(
	schema: M | undefined,
	data: unknown,
): Promise<unknown> {
	if (!schema) {
		return {};
	}

	let parsedMetadata = schema["~standard"].validate(data);

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

	return parsedMetadata.value;
}

export function transformMetadata(
	metadata: unknown,
): Record<string, string> | undefined {
	if (!metadata || typeof metadata !== "object") {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(metadata as Record<string, unknown>).map(([key, value]) => [
			key,
			value == null ? "" : String(value),
		]),
	);
}

export function validateContext(ctx: {
	context: { $options?: unknown } | null | undefined;
}): void {
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
}
