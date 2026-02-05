/**
 * Content validation module.
 *
 * This module provides utilities for validating file uploads using custom validators.
 *
 * @example
 * ```typescript
 * import { runContentValidators, createValidator } from "vs3/validation";
 *
 * const result = await runContentValidators({
 *   validators: [
 *     createValidator("max-size", (ctx) => {
 *       if (ctx.fileInfo.size > 1024 * 1024) {
 *         return { valid: false, reason: "File exceeds 1MB limit" };
 *       }
 *       return { valid: true };
 *     }),
 *   ],
 *   context: { fileInfo, metadata },
 * });
 * ```
 */

import type {
	ContentValidationContext,
	ContentValidationResult,
	ContentValidationRunResult,
	ContentValidator,
	ContentValidatorInput,
	NamedContentValidator,
	RunContentValidatorsOptions,
} from "../../types/validation";

// Re-export file validation utilities
export {
	getAllowedFileTypesConfigIssue,
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getMagicByteLength,
	getObjectKeyValidationIssue,
	type FileTypeValidationInput,
	type FileValidationIssue,
} from "./file-validator";

export { sanitizeFilename } from "./filename-sanitizer";

// Re-export types
export type {
	ContentValidationContext,
	ContentValidationResult,
	ContentValidationRunResult,
	ContentValidator,
	ContentValidatorInput,
	NamedContentValidator,
	RunContentValidatorsOptions,
};

/**
 * Type guard to check if a validator input is a named validator.
 */
function isNamedValidator<TMetadata>(
	validator: ContentValidatorInput<TMetadata>,
): validator is NamedContentValidator<TMetadata> {
	return (
		typeof validator === "object" &&
		validator !== null &&
		"name" in validator &&
		"validate" in validator
	);
}

/**
 * Extracts the validator function and optional name from a validator input.
 */
function extractValidator<TMetadata>(
	input: ContentValidatorInput<TMetadata>,
): { fn: ContentValidator<TMetadata>; name?: string } {
	if (isNamedValidator(input)) {
		return { fn: input.validate, name: input.name };
	}
	return { fn: input };
}

/**
 * Creates a timeout that can be cleaned up.
 * Returns both the promise and a cleanup function to clear the timer.
 */
function createTimeoutWithCleanup(timeoutMs: number): {
	promise: Promise<never>;
	clear: () => void;
} {
	let timerId: ReturnType<typeof setTimeout>;

	const promise = new Promise<never>((_, reject) => {
		timerId = setTimeout(() => {
			reject(new Error(`Validator timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	return {
		promise,
		clear: () => clearTimeout(timerId),
	};
}

/**
 * Runs a single validator with optional timeout.
 */
async function runSingleValidator<TMetadata>(
	validator: ContentValidator<TMetadata>,
	context: ContentValidationContext<TMetadata>,
	timeoutMs?: number,
): Promise<ContentValidationResult> {
	const resultOrPromise = validator(context);

	// If synchronous result, return immediately
	if (!(resultOrPromise instanceof Promise)) {
		return resultOrPromise;
	}

	// If no timeout, just await the promise
	if (timeoutMs === undefined) {
		return await resultOrPromise;
	}

	// Race between the validator and timeout, ensuring cleanup
	const timeout = createTimeoutWithCleanup(timeoutMs);

	try {
		return await Promise.race([resultOrPromise, timeout.promise]);
	} finally {
		timeout.clear();
	}
}

/**
 * Runs an array of content validators sequentially.
 * Stops at the first validation failure.
 *
 * @param options - Configuration for running validators
 * @returns Result indicating whether all validators passed
 *
 * @example
 * ```typescript
 * const result = await runContentValidators({
 *   validators: [
 *     (ctx) => ctx.fileInfo.size < 1024 * 1024
 *       ? { valid: true }
 *       : { valid: false, reason: "File too large" },
 *     async (ctx) => {
 *       const isDuplicate = await checkDuplicate(ctx.fileInfo);
 *       return isDuplicate
 *         ? { valid: false, reason: "Duplicate file" }
 *         : { valid: true };
 *     },
 *   ],
 *   context: { fileInfo, metadata },
 * });
 *
 * if (!result.valid) {
 *   console.error(`Validation failed: ${result.failure?.reason}`);
 * }
 * ```
 */
export async function runContentValidators<TMetadata = unknown>(
	options: RunContentValidatorsOptions<TMetadata>,
): Promise<ContentValidationRunResult> {
	const { validators, context, timeoutMs } = options;

	for (let i = 0; i < validators.length; i++) {
		const validatorInput = validators[i];
		if (validatorInput === undefined) {
			continue;
		}

		const { fn, name } = extractValidator(validatorInput);

		try {
			const result = await runSingleValidator(fn, context, timeoutMs);

			if (!result.valid) {
				return {
					valid: false,
					failure: {
						validatorName: name,
						validatorIndex: i,
						reason: result.reason,
					},
				};
			}
		} catch (error) {
			// Handle timeout or other errors
			const reason =
				error instanceof Error ? error.message : "Validator threw an error";

			return {
				valid: false,
				failure: {
					validatorName: name,
					validatorIndex: i,
					reason,
				},
			};
		}
	}

	return { valid: true };
}

/**
 * Creates a named content validator.
 * Named validators provide better error messages when validation fails.
 *
 * @param name - Name of the validator for error reporting
 * @param validate - The validator function
 * @returns A named content validator object
 *
 * @example
 * ```typescript
 * const maxSizeValidator = createValidator("max-file-size", (ctx) => {
 *   const maxSize = 5 * 1024 * 1024; // 5MB
 *   if (ctx.fileInfo.size > maxSize) {
 *     return { valid: false, reason: `File exceeds ${maxSize} bytes` };
 *   }
 *   return { valid: true };
 * });
 * ```
 */
export function createValidator<TMetadata = unknown>(
	name: string,
	validate: ContentValidator<TMetadata>,
): NamedContentValidator<TMetadata> {
	return { name, validate };
}

// ============================================================================
// Common Validators (Examples)
// ============================================================================

/**
 * Creates a validator that checks if the file size is within a maximum limit.
 *
 * @param maxSizeBytes - Maximum allowed file size in bytes
 * @returns A named content validator
 *
 * @example
 * ```typescript
 * const validator = createMaxSizeValidator(5 * 1024 * 1024); // 5MB
 * ```
 */
export function createMaxSizeValidator(
	maxSizeBytes: number,
): NamedContentValidator {
	return createValidator("max-file-size", (ctx) => {
		if (ctx.fileInfo.size > maxSizeBytes) {
			return {
				valid: false,
				reason: `File size (${ctx.fileInfo.size} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes)`,
			};
		}
		return { valid: true };
	});
}

/**
 * Creates a validator that checks if the file size meets a minimum requirement.
 *
 * @param minSizeBytes - Minimum required file size in bytes
 * @returns A named content validator
 *
 * @example
 * ```typescript
 * const validator = createMinSizeValidator(1024); // At least 1KB
 * ```
 */
export function createMinSizeValidator(
	minSizeBytes: number,
): NamedContentValidator {
	return createValidator("min-file-size", (ctx) => {
		if (ctx.fileInfo.size < minSizeBytes) {
			return {
				valid: false,
				reason: `File size (${ctx.fileInfo.size} bytes) is below minimum required size (${minSizeBytes} bytes)`,
			};
		}
		return { valid: true };
	});
}

/**
 * Creates a validator that checks if the content type matches allowed types.
 *
 * @param allowedTypes - Array of allowed MIME types (supports wildcards like "image/*")
 * @returns A named content validator
 *
 * @example
 * ```typescript
 * const validator = createContentTypeValidator(["image/*", "application/pdf"]);
 * ```
 */
export function createContentTypeValidator(
	allowedTypes: string[],
): NamedContentValidator {
	return createValidator("content-type", (ctx) => {
		const contentType = ctx.fileInfo.contentType.toLowerCase();

		for (const allowed of allowedTypes) {
			const pattern = allowed.toLowerCase();

			if (pattern.endsWith("/*")) {
				const prefix = pattern.slice(0, -1);
				if (contentType.startsWith(prefix)) {
					return { valid: true };
				}
			} else if (contentType === pattern) {
				return { valid: true };
			}
		}

		return {
			valid: false,
			reason: `Content type "${ctx.fileInfo.contentType}" is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
		};
	});
}

/**
 * Creates a validator that checks if the filename matches allowed extensions.
 *
 * @param allowedExtensions - Array of allowed file extensions (with or without leading dot)
 * @returns A named content validator
 *
 * @example
 * ```typescript
 * const validator = createExtensionValidator([".jpg", ".png", ".gif"]);
 * // or
 * const validator = createExtensionValidator(["jpg", "png", "gif"]);
 * ```
 */
export function createExtensionValidator(
	allowedExtensions: string[],
): NamedContentValidator {
	const normalizedExtensions = allowedExtensions.map((ext) =>
		ext.toLowerCase().replace(/^\./, ""),
	);

	return createValidator("file-extension", (ctx) => {
		const fileName = ctx.fileInfo.name.toLowerCase();
		const lastDot = fileName.lastIndexOf(".");

		if (lastDot === -1 || lastDot === fileName.length - 1) {
			return {
				valid: false,
				reason: `File "${ctx.fileInfo.name}" has no extension. Allowed extensions: ${normalizedExtensions.join(", ")}`,
			};
		}

		const extension = fileName.slice(lastDot + 1);

		if (!normalizedExtensions.includes(extension)) {
			return {
				valid: false,
				reason: `File extension ".${extension}" is not allowed. Allowed extensions: ${normalizedExtensions.join(", ")}`,
			};
		}

		return { valid: true };
	});
}

/**
 * Creates a validator that checks if the filename matches a pattern.
 *
 * @param pattern - Regular expression pattern to match against the filename
 * @param errorMessage - Custom error message when validation fails
 * @returns A named content validator
 *
 * @example
 * ```typescript
 * // Only allow alphanumeric filenames with underscores
 * const validator = createFilenamePatternValidator(
 *   /^[a-zA-Z0-9_]+\.[a-zA-Z0-9]+$/,
 *   "Filename must only contain letters, numbers, and underscores"
 * );
 * ```
 */
export function createFilenamePatternValidator(
	pattern: RegExp,
	errorMessage?: string,
): NamedContentValidator {
	return createValidator("filename-pattern", (ctx) => {
		if (!pattern.test(ctx.fileInfo.name)) {
			return {
				valid: false,
				reason: errorMessage ?? `Filename "${ctx.fileInfo.name}" does not match required pattern`,
			};
		}
		return { valid: true };
	});
}

/**
 * Combines multiple validators into a single validator.
 * All validators must pass for the combined validator to pass.
 *
 * @param name - Name for the combined validator
 * @param validators - Array of validators to combine
 * @returns A named content validator that runs all validators
 *
 * @example
 * ```typescript
 * const imageValidator = combineValidators("image-upload", [
 *   createMaxSizeValidator(5 * 1024 * 1024),
 *   createContentTypeValidator(["image/*"]),
 *   createExtensionValidator(["jpg", "png", "gif", "webp"]),
 * ]);
 * ```
 */
export function combineValidators<TMetadata = unknown>(
	name: string,
	validators: ContentValidatorInput<TMetadata>[],
): NamedContentValidator<TMetadata> {
	return createValidator(name, async (ctx) => {
		const result = await runContentValidators({
			validators,
			context: ctx,
		});

		if (!result.valid && result.failure) {
			return {
				valid: false,
				reason: result.failure.reason,
			};
		}

		return { valid: true };
	});
}
