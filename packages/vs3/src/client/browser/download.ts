const DEFAULT_DOWNLOAD_FILENAME = "download";

/**
 * Extracts the file name from an object key (last path segment).
 * Returns a default filename when the key yields no usable name.
 */
export function extractFileName(key: string): string {
	const segments = key.split("/");
	const lastSegment = segments[segments.length - 1];
	return lastSegment || DEFAULT_DOWNLOAD_FILENAME;
}

/**
 * Fetches the file via the presigned URL, creates a Blob + object URL,
 * and triggers a browser download using an anchor element.
 *
 * @throws {Error} When the fetch response indicates a non-ok status.
 */
export async function triggerBrowserDownload(
	presignedUrl: string,
	fileName: string,
	downloadHeaders?: Record<string, string>,
): Promise<void> {
	const response = await fetch(presignedUrl, {
		headers: downloadHeaders,
	});

	if (!response.ok) {
		throw new Error(`Download failed: ${response.status} ${response.statusText}`);
	}

	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);

	try {
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = fileName;
		anchor.style.display = "none";
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

/**
 * Opens the presigned URL in a new browser tab.
 */
export function openInBrowserTab(presignedUrl: string): void {
	window.open(presignedUrl, "_blank", "noopener,noreferrer");
}
