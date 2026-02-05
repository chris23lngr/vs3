// biome-ignore-all lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for security validation

/**
 * Default maximum filename length.
 * Common filesystem limit (ext4, NTFS, HFS+) is 255 bytes; this value is
 * enforced as a character length, not a byte limit.
 */
export const DEFAULT_MAX_FILENAME_LENGTH = 255;

/**
 * Fallback filename used when sanitization results in an empty string.
 */
export const DEFAULT_FALLBACK_FILENAME = "file";

export type SanitizeFilenameOptions = {
	/**
	 * Maximum allowed length for the filename (including extension).
	 * Defaults to 255 characters.
	 */
	maxLength?: number;

	/**
	 * Filename to use if sanitization results in an empty string.
	 * Defaults to "file".
	 */
	fallbackFilename?: string;

	/**
	 * Character used to replace invalid characters.
	 * Defaults to underscore "_".
	 */
	replacementChar?: string;
};

export type SanitizeFilenameResult = {
	/** The sanitized filename. */
	sanitized: string;

	/** Whether the filename was modified during sanitization. */
	wasModified: boolean;

	/** List of sanitization operations applied. */
	appliedOperations: SanitizationOperation[];
};

export type SanitizationOperation =
	| "removed_control_characters"
	| "removed_null_bytes"
	| "decoded_percent_encoding"
	| "removed_path_separators"
	| "removed_path_traversal"
	| "trimmed_whitespace"
	| "truncated_length"
	| "used_fallback";

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/g;
const CONTROL_CHAR_TEST_REGEX = /[\x00-\x1F\x7F]/;
const NULL_BYTE_REGEX = /\x00/g;
const PATH_SEPARATOR_REGEX = /[/\\]/g;
const PATH_SEPARATOR_CHAR_REGEX = /[/\\]/;
const CONSECUTIVE_DOTS_REGEX = /\.{2,}/g;
const LEADING_TRAILING_DOTS_REGEX = /^\.+|\.+$/g;
const SINGLE_CHAR_REGEX = /^.$/u;
const PERCENT_ENCODED_SLASH_REGEX = /%2f/gi;
const PERCENT_ENCODED_BACKSLASH_REGEX = /%5c/gi;
const PERCENT_ENCODED_DOT_REGEX = /%2e/gi;

/**
 * Extracts the file extension from a filename.
 * Returns empty string if no valid extension exists.
 */
function extractExtension(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === filename.length - 1) {
		return "";
	}
	return filename.slice(lastDot);
}

/**
 * Extracts the base name (without extension) from a filename.
 */
function extractBaseName(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	if (lastDot <= 0) {
		return filename;
	}
	return filename.slice(0, lastDot);
}

/**
 * Removes null bytes from a string.
 */
function removeNullBytes(value: string): { result: string; modified: boolean } {
	const result = value.replace(NULL_BYTE_REGEX, "");
	return { result, modified: result !== value };
}

/**
 * Removes control characters (0x00-0x1F and 0x7F) from a string.
 */
function removeControlCharacters(
	value: string,
	replacementChar: string,
): { result: string; modified: boolean } {
	const result = value.replace(CONTROL_CHAR_REGEX, replacementChar);
	return { result, modified: result !== value };
}

/**
 * Removes path separators (forward slash and backslash) from a string.
 */
function removePathSeparators(
	value: string,
	replacementChar: string,
): { result: string; modified: boolean } {
	const result = value.replace(PATH_SEPARATOR_REGEX, replacementChar);
	return { result, modified: result !== value };
}

/**
 * Removes path traversal sequences (../ and ./).
 * Also collapses consecutive dots and removes leading/trailing dots.
 */
function removePathTraversal(value: string): {
	result: string;
	modified: boolean;
} {
	let result = value;

	// Remove consecutive dots (potential path traversal)
	result = result.replace(CONSECUTIVE_DOTS_REGEX, ".");

	// Remove leading and trailing dots (e.g., ".file" or "file.")
	// Preserve single dot for hidden files but remove multiple leading dots
	const hasLeadingDot = result.startsWith(".");
	result = result.replace(LEADING_TRAILING_DOTS_REGEX, "");

	// Restore single leading dot for hidden files if it was a single dot
	if (hasLeadingDot && !value.startsWith("..")) {
		result = `.${result}`;
	}

	return { result, modified: result !== value };
}

function decodePercentEncoding(value: string): {
	result: string;
	modified: boolean;
} {
	let result = value.replace(PERCENT_ENCODED_SLASH_REGEX, "/");
	result = result.replace(PERCENT_ENCODED_BACKSLASH_REGEX, "\\");
	result = result.replace(PERCENT_ENCODED_DOT_REGEX, ".");
	return { result, modified: result !== value };
}

/**
 * Truncates a filename to a maximum length while preserving the extension.
 */
function truncateFilename(
	filename: string,
	maxLength: number,
): { result: string; modified: boolean } {
	if (filename.length <= maxLength) {
		return { result: filename, modified: false };
	}

	const extension = extractExtension(filename);
	const baseName = extractBaseName(filename);

	// If extension alone exceeds max length, truncate everything
	if (extension.length >= maxLength) {
		return { result: filename.slice(0, maxLength), modified: true };
	}

	// Truncate base name to fit with extension
	const maxBaseLength = maxLength - extension.length;
	const truncatedBase = baseName.slice(0, maxBaseLength);

	return { result: truncatedBase + extension, modified: true };
}

/**
 * Collapses multiple consecutive replacement characters into one.
 */
function collapseReplacementChars(
	value: string,
	replacementChar: string,
): string {
	if (!replacementChar) {
		return value;
	}
	const escaped = replacementChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const consecutiveRegex = new RegExp(`${escaped}{2,}`, "g");
	return value.replace(consecutiveRegex, replacementChar);
}

function applyStep(
	applied: SanitizationOperation[],
	operation: SanitizationOperation,
	result: { result: string; modified: boolean },
): string {
	if (result.modified) {
		applied.push(operation);
	}
	return result.result;
}

function applySecurityRemovals(
	filename: string,
	replacementChar: string,
): { value: string; applied: SanitizationOperation[] } {
	const applied: SanitizationOperation[] = [];
	let current = filename;

	current = applyStep(applied, "removed_null_bytes", removeNullBytes(current));
	current = applyStep(
		applied,
		"removed_control_characters",
		removeControlCharacters(current, replacementChar),
	);
	current = applyStep(
		applied,
		"decoded_percent_encoding",
		decodePercentEncoding(current),
	);
	current = applyStep(
		applied,
		"removed_path_separators",
		removePathSeparators(current, replacementChar),
	);
	current = applyStep(
		applied,
		"removed_path_traversal",
		removePathTraversal(current),
	);

	return { value: current, applied };
}

function applyWhitespaceAndReplacements(
	value: string,
	replacementChar: string,
	applied: SanitizationOperation[],
	shouldPreserveLeading: boolean,
	shouldPreserveTrailing: boolean,
): string {
	const trimmed = value.trim();
	if (trimmed !== value) {
		applied.push("trimmed_whitespace");
	}
	let current = collapseReplacementChars(trimmed, replacementChar);
	if (replacementChar) {
		const escaped = replacementChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!shouldPreserveLeading) {
			const leadingRegex = new RegExp(`^${escaped}+`, "g");
			current = current.replace(leadingRegex, "");
		}
		if (!shouldPreserveTrailing) {
			const trailingRegex = new RegExp(`${escaped}+$`, "g");
			current = current.replace(trailingRegex, "");
		}
	}
	return current;
}

function applySanitizationSteps(
	filename: string,
	replacementChar: string,
): { value: string; applied: SanitizationOperation[] } {
	const removals = applySecurityRemovals(filename, replacementChar);
	const preserveLeading =
		replacementChar.length > 0 && filename.startsWith(replacementChar);
	const preserveTrailing =
		replacementChar.length > 0 && filename.endsWith(replacementChar);
	const cleaned = applyWhitespaceAndReplacements(
		removals.value,
		replacementChar,
		removals.applied,
		preserveLeading,
		preserveTrailing,
	);
	return { value: cleaned, applied: removals.applied };
}

function isValidReplacementChar(value: string): boolean {
	if (value.length === 0) {
		return true;
	}
	if (!SINGLE_CHAR_REGEX.test(value)) {
		return false;
	}
	if (PATH_SEPARATOR_CHAR_REGEX.test(value)) {
		return false;
	}
	return !CONTROL_CHAR_TEST_REGEX.test(value);
}

function normalizeMaxLength(value: number | undefined): number {
	if (!Number.isFinite(value) || value === undefined) {
		return DEFAULT_MAX_FILENAME_LENGTH;
	}
	if (!Number.isInteger(value) || value < 1) {
		return DEFAULT_MAX_FILENAME_LENGTH;
	}
	return value;
}

function normalizeOptions(
	options: SanitizeFilenameOptions,
): Required<SanitizeFilenameOptions> {
	const maxLength = normalizeMaxLength(options.maxLength);
	const fallbackFilename = options.fallbackFilename ?? DEFAULT_FALLBACK_FILENAME;
	const replacementCandidate = options.replacementChar ?? "_";
	const replacementChar = isValidReplacementChar(replacementCandidate)
		? replacementCandidate
		: "_";

	return {
		maxLength,
		fallbackFilename,
		replacementChar,
	};
}

/**
 * Sanitizes a filename by removing dangerous characters and patterns.
 *
 * This function:
 * - Removes null bytes (security risk)
 * - Removes control characters (0x00-0x1F, 0x7F)
 * - Removes path separators (/ and \) to prevent path traversal
 * - Removes path traversal sequences (.. and consecutive dots)
 * - Trims leading and trailing whitespace
 * - Truncates to maximum length while preserving extension
 * - Returns a fallback filename if result is empty
 *
 * @param filename - The filename to sanitize
 * @param options - Optional configuration for sanitization behavior
 * @returns Sanitization result with the sanitized filename and metadata
 */
export function sanitizeFilename(
	filename: string,
	options: SanitizeFilenameOptions = {},
): SanitizeFilenameResult {
	const { maxLength, fallbackFilename, replacementChar } =
		normalizeOptions(options);

	const sanitized = applySanitizationSteps(filename, replacementChar);
	const appliedOperations = sanitized.applied;
	let current = sanitized.value;

	// Step 8: Truncate to max length
	const truncateResult = truncateFilename(current, maxLength);
	if (truncateResult.modified) {
		appliedOperations.push("truncated_length");
	}
	current = truncateResult.result;

	// Step 9: Use fallback if result is empty
	if (!current) {
		appliedOperations.push("used_fallback");
		current = fallbackFilename;
	}

	const wasModified = current !== filename;

	return {
		sanitized: current,
		wasModified,
		appliedOperations,
	};
}

/**
 * Convenience function that returns just the sanitized filename string.
 * Use `sanitizeFilename` if you need metadata about what operations were applied.
 */
export function sanitize(
	filename: string,
	options: SanitizeFilenameOptions = {},
): string {
	return sanitizeFilename(filename, options).sanitized;
}
