/**
 * Formats a file size in bytes to a human-readable string.
 * @param bytes - The file size in bytes
 * @returns Human-readable file size (e.g., "1.5 MB", "500 KB")
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) {
		return "0 bytes";
	}

	if (bytes === 1) {
		return "1 byte";
	}

	const units = ["bytes", "KB", "MB", "GB", "TB"];
	const k = 1024;

	if (bytes < k) {
		return `${bytes} bytes`;
	}

	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const value = bytes / Math.pow(k, i);

	return `${value.toFixed(1)} ${units[i]}`;
}
