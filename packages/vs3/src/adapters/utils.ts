import { StorageErrorCode } from "../core/error/codes";
import { StorageServerError } from "../core/error/error";
import type { FileInfo } from "../types/file";

/**
 * Default object key generator.
 *
 * Uses the file info and a unique id to generate a key. Replaces any illegal
 * characters with a hyphen while preserving the original extension.
 *
 * @param fileInfo
 * @param metadata
 */
export function generateObjectKey({ name }: FileInfo) {
	const extension = name.split(".").pop();
	const fileName = name.split(".").shift();

	if (!extension) {
		throw new StorageServerError({
			code: StorageErrorCode.INVALID_FILE_INFO,
			message: "File info is missing an extension.",
			details:
				"The file info is missing an extension. Please provide a valid file info. This is likely due to the file name being invalid.",
		});
	}

	const id = crypto.randomUUID();

	const cleanedFileName = fileName?.replace(/[^a-zA-Z0-9]/g, "-") ?? "";

	const key = `${id}-${cleanedFileName}.${extension}`;
	return key;
}
