import type { StorageOptions } from "../../types/options";
import { StorageErrorCode } from "../error/codes";
import { StorageServerError } from "../error/error";
import { getAllowedFileTypesConfigIssue } from "../validation/file-validator";

/**
 * Validates maxFileSize configuration value.
 * @param maxFileSize - The maximum file size in bytes
 * @throws {StorageServerError} If maxFileSize is invalid
 */
function validateMaxFileSize(maxFileSize: number | undefined): void {
	if (maxFileSize === undefined) {
		return;
	}

	if (!Number.isFinite(maxFileSize)) {
		throw new StorageServerError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid maxFileSize configuration.",
			details: "maxFileSize must be a finite number.",
		});
	}

	if (maxFileSize <= 0) {
		throw new StorageServerError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "Invalid maxFileSize configuration.",
			details: "maxFileSize must be greater than 0.",
		});
	}
}

/**
 * Validates storage options at configuration time.
 * @param options - The storage options to validate
 * @throws {StorageServerError} If any option is invalid
 */
export function validateStorageOptions(options: StorageOptions): void {
	validateMaxFileSize(options.maxFileSize);

	const allowedFileTypesIssue = getAllowedFileTypesConfigIssue(
		options.allowedFileTypes,
	);
	if (allowedFileTypesIssue) {
		throw new StorageServerError(allowedFileTypesIssue);
	}
}
