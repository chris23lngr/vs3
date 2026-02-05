import type { Headers } from "./types";
import { XhrFactory } from "./xhr-factory";

const DEFAULT_RETRY_ATTEMPTS = 3;

type XhrUploadOptions = {
	/**
	 * Determines whether to retry the upload if it fails.
	 *
	 * When set to true, the upload will be retried up to 3 times. The number of
	 * attempts can be configured by setting the retry option to a number.
	 *
	 * @default undefined - No retries will be attempted.
	 */
	retry?: undefined | true | number;

	/**
	 * Additional headers to be sent with the request.
	 *
	 * @default undefined - No additional headers will be sent.
	 */
	headers?: Headers;

	/**
	 * When enabled, debug messages will be logged to the console. Do not use this in production
	 * since it might leak sensitive information.
	 *
	 * @default false - No debug messages will be logged.
	 */
	debug?: boolean;

	/**
	 * Abort signal to cancel the upload.
	 *
	 * @default undefined - No abort signal will be used.
	 */
	signal?: AbortSignal;

	/**
	 * Callback to be called with the progress of the upload.
	 */
	onProgress?: (progress: number) => void;
};

/**
 * Uploads a file from the client to a given URL using XMLHttpRequest.
 */
export async function xhrUpload(
	url: string,
	file: File,
	options?: XhrUploadOptions,
) {
	const { retry, headers = {}, onProgress, signal } = options ?? {};

	let maxAttempts = 1;

	if (typeof retry === "number") {
		maxAttempts = retry;
	} else if (retry === true) {
		maxAttempts = DEFAULT_RETRY_ATTEMPTS;
	}

	let attempt = 0;
	while (attempt < maxAttempts) {
		try {
			return await new Promise((resolve, reject) => {
				const xhr = new XhrFactory(signal);

				xhr.open("PUT", url, true);

				if (file.type && !headers["content-type"]) {
					// Set the content type if it is not already set
					headers["content-type"] = file.type;
				}
				xhr.appendHeaders(headers);

				xhr.appendProgressHandler(onProgress);

				xhr.appendErrorHandler((status, statusText, cleanup) => {
					console.log("error occurred", status, statusText);
					cleanup();
					reject(new Error(`Error occurred: ${statusText}`));
				});

				xhr.appendAbortHandler(() => {
					reject(new DOMException("Upload aborted", "AbortError"));
				});

				xhr.appendLoadHandler((success, status, statusText, cleanup) => {
					if (success) {
						cleanup();
						resolve({
							uploadUrl: url,
							status: status,
							statusText,
						});
						return;
					}

					// TODO: add error handling for non-success responses
					cleanup();
					reject(new Error(`Error occurred: ${statusText}`));
				});

				xhr.send(file);
			});
		} catch (error) {
			attempt++;

			if (error instanceof DOMException && error.name === "AbortError") {
				throw error;
			}

			throw error;
		}
	}
}
