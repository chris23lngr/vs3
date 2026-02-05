import { StorageErrorCode } from "../error/codes";
import type { FileInfo } from "../../types/file";

export type FileValidationIssue = {
	code: StorageErrorCode;
	message: string;
	details: string | Record<string, unknown>;
};

export type FileTypeValidationInput = {
	fileInfo: FileInfo;
	allowedFileTypes: string[] | undefined;
	fileBytes?: Uint8Array | undefined;
};

type MagicType = {
	mime: string;
	extension: string;
};

const MAGIC_BYTE_LENGTH = 12;

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for security validation
const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;
const MIME_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+*-]+$/i;

/**
 * Extension aliases map for normalization.
 * Keys are alternative extensions, values are the canonical extension.
 * This ensures "jpeg" and "jpg" are treated as equivalent.
 */
const EXTENSION_ALIASES: Record<string, string> = {
	jpeg: "jpg",
};

function normalizeExtension(extension: string): string {
	const lower = extension.replace(/^\./, "").toLowerCase();
	return EXTENSION_ALIASES[lower] ?? lower;
}

function getFileExtension(fileName: string): string {
	const lastDot = fileName.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === fileName.length - 1) {
		return "";
	}
	return normalizeExtension(fileName.slice(lastDot + 1));
}

function isMimePattern(value: string): boolean {
	return value.includes("/");
}

function parseAllowedFileTypes(
	allowedFileTypes: string[],
): { mimePatterns: string[]; extensions: string[] } {
	const mimePatterns: string[] = [];
	const extensions: string[] = [];

	for (const raw of allowedFileTypes) {
		const value = raw.trim().toLowerCase();
		if (!value) {
			continue;
		}
		if (isMimePattern(value)) {
			mimePatterns.push(value);
		} else {
			const normalized = normalizeExtension(value);
			if (normalized) {
				extensions.push(normalized);
			}
		}
	}

	return { mimePatterns, extensions };
}

function matchesMimePattern(contentType: string, pattern: string): boolean {
	if (pattern.endsWith("/*")) {
		const prefix = pattern.slice(0, pattern.length - 1);
		return contentType.startsWith(prefix);
	}
	return contentType === pattern;
}

function matchesAnyMime(
	contentType: string,
	patterns: string[],
): boolean {
	return patterns.some((pattern) => matchesMimePattern(contentType, pattern));
}

function matchesAnyExtension(extension: string, allowed: string[]): boolean {
	return allowed.includes(extension);
}

function bytesMatchSignature(
	bytes: Uint8Array,
	signature: number[],
	offset = 0,
): boolean {
	if (bytes.length < signature.length + offset) {
		return false;
	}
	return signature.every((byte, index) => bytes[index + offset] === byte);
}

function detectMagicType(bytes: Uint8Array): MagicType | null {
	if (bytesMatchSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return { mime: "image/png", extension: "png" };
	}
	if (bytesMatchSignature(bytes, [0xff, 0xd8, 0xff])) {
		return { mime: "image/jpeg", extension: "jpg" };
	}
	if (bytesMatchSignature(bytes, [0x47, 0x49, 0x46, 0x38])) {
		return { mime: "image/gif", extension: "gif" };
	}
	if (bytesMatchSignature(bytes, [0x25, 0x50, 0x44, 0x46])) {
		return { mime: "application/pdf", extension: "pdf" };
	}
	if (
		bytesMatchSignature(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		bytesMatchSignature(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	) {
		return { mime: "image/webp", extension: "webp" };
	}
	return null;
}

function createInvalidFileInfoIssue(
	message: string,
	details: string | Record<string, unknown>,
): FileValidationIssue {
	return {
		code: StorageErrorCode.INVALID_FILE_INFO,
		message,
		details,
	};
}

function getMimeTypeIssue(
	contentType: string,
	mimePatterns: string[],
	allowedFileTypes: string[],
	fileName: string,
): FileValidationIssue | null {
	if (mimePatterns.length === 0) {
		return null;
	}
	if (!matchesAnyMime(contentType, mimePatterns)) {
		return createInvalidFileInfoIssue("File type is not allowed.", {
			contentType,
			allowedFileTypes,
			fileName,
		});
	}
	return null;
}

function getExtensionIssue(
	extension: string,
	extensions: string[],
	allowedFileTypes: string[],
	fileName: string,
): FileValidationIssue | null {
	if (extensions.length === 0) {
		return null;
	}
	if (!matchesAnyExtension(extension, extensions)) {
		return createInvalidFileInfoIssue("File extension is not allowed.", {
			fileExtension: extension,
			allowedFileTypes,
			fileName,
		});
	}
	return null;
}

function getMagicIssue(
	fileBytes: Uint8Array | undefined,
	allowedFileTypes: string[],
	mimePatterns: string[],
	extensions: string[],
	fileName: string,
): FileValidationIssue | null {
	if (!fileBytes) {
		return null;
	}

	const magic = detectMagicType(fileBytes);
	if (!magic) {
		return null;
	}

	if (mimePatterns.length > 0 && !matchesAnyMime(magic.mime, mimePatterns)) {
		return createInvalidFileInfoIssue("File content type is not allowed.", {
			detectedMime: magic.mime,
			allowedFileTypes,
			fileName,
		});
	}

	if (extensions.length > 0 && !matchesAnyExtension(magic.extension, extensions)) {
		return createInvalidFileInfoIssue("File content does not match allowed extensions.", {
			detectedExtension: magic.extension,
			allowedFileTypes,
			fileName,
		});
	}

	return null;
}

function getAllowedFileTypeEntryIssue(
	entry: string,
): FileValidationIssue | null {
	if (typeof entry !== "string" || entry.trim().length === 0) {
		return createInvalidFileInfoIssue(
			"Invalid allowedFileTypes configuration.",
			"allowedFileTypes entries must be non-empty strings.",
		);
	}

	const trimmed = entry.trim();
	if (isMimePattern(trimmed) && !MIME_PATTERN.test(trimmed)) {
		return createInvalidFileInfoIssue(
			"Invalid allowedFileTypes configuration.",
			`Invalid MIME type pattern: "${entry}".`,
		);
	}

	if (!isMimePattern(trimmed)) {
		const extension = normalizeExtension(trimmed);
		if (!extension || !/^[a-z0-9]+$/i.test(extension)) {
			return createInvalidFileInfoIssue(
				"Invalid allowedFileTypes configuration.",
				`Invalid file extension: "${entry}".`,
			);
		}
	}

	return null;
}

export function getMagicByteLength(): number {
	return MAGIC_BYTE_LENGTH;
}

export function getAllowedFileTypesConfigIssue(
	allowedFileTypes: string[] | undefined,
): FileValidationIssue | null {
	if (allowedFileTypes === undefined) {
		return null;
	}

	if (allowedFileTypes.length === 0) {
		return createInvalidFileInfoIssue(
			"Invalid allowedFileTypes configuration.",
			"allowedFileTypes must include at least one MIME type or file extension.",
		);
	}

	for (const entry of allowedFileTypes) {
		const entryIssue = getAllowedFileTypeEntryIssue(entry);
		if (entryIssue) {
			return entryIssue;
		}
	}

	return null;
}

export function getFileNameValidationIssue(
	fileName: string,
): FileValidationIssue | null {
	const trimmed = fileName.trim();
	if (!trimmed) {
		return createInvalidFileInfoIssue(
			"Invalid file name.",
			"File name must not be empty.",
		);
	}

	if (CONTROL_CHAR_REGEX.test(fileName)) {
		return createInvalidFileInfoIssue(
			"Invalid file name.",
			"File name contains control characters.",
		);
	}

	if (fileName.includes("/") || fileName.includes("\\")) {
		return createInvalidFileInfoIssue(
			"Invalid file name.",
			"File name must not include path separators.",
		);
	}

	return null;
}

export function getObjectKeyValidationIssue(
	objectKey: string,
): FileValidationIssue | null {
	if (!objectKey.trim()) {
		return createInvalidFileInfoIssue(
			"Invalid object key.",
			"Object key must not be empty.",
		);
	}

	if (CONTROL_CHAR_REGEX.test(objectKey)) {
		return createInvalidFileInfoIssue(
			"Invalid object key.",
			"Object key contains control characters.",
		);
	}

	if (objectKey.includes("\\")) {
		return createInvalidFileInfoIssue(
			"Invalid object key.",
			"Object key must not include backslashes.",
		);
	}

	const hasTraversal = objectKey
		.split("/")
		.some((segment) => segment === "." || segment === "..");
	if (hasTraversal) {
		return createInvalidFileInfoIssue(
			"Invalid object key.",
			"Object key must not include path traversal segments.",
		);
	}

	return null;
}

export function getFileTypeValidationIssue(
	input: FileTypeValidationInput,
): FileValidationIssue | null {
	const allowedFileTypes = input.allowedFileTypes;
	if (!allowedFileTypes || allowedFileTypes.length === 0) {
		return null;
	}

	const parsed = parseAllowedFileTypes(allowedFileTypes);
	const contentType = input.fileInfo.contentType.toLowerCase();
	const extension = getFileExtension(input.fileInfo.name);

	const mimeIssue = getMimeTypeIssue(
		contentType,
		parsed.mimePatterns,
		allowedFileTypes,
		input.fileInfo.name,
	);
	if (mimeIssue) {
		return mimeIssue;
	}

	const extensionIssue = getExtensionIssue(
		extension,
		parsed.extensions,
		allowedFileTypes,
		input.fileInfo.name,
	);
	if (extensionIssue) {
		return extensionIssue;
	}

	return getMagicIssue(
		input.fileBytes,
		allowedFileTypes,
		parsed.mimePatterns,
		parsed.extensions,
		input.fileInfo.name,
	);
}
