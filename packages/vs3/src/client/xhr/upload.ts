import {
	calculateRetryDelay,
	DEFAULT_RETRY_CONFIG,
	type RetryConfig,
	sleep,
} from "../../core/resilience/retry";
import type { Headers } from "./types";
import { XhrFactory } from "./xhr-factory";

const DEFAULT_RETRY_ATTEMPTS = 3;

export type XhrUploadOptions = {
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

	/**
	 * Configuration for retry behavior with exponential backoff and jitter.
	 * This is used when retry is enabled (retry: true or retry: number).
	 *
	 * @default DEFAULT_RETRY_CONFIG - Uses sensible defaults for production use.
	 */
	retryConfig?: RetryConfig;
};

export type XhrUploadResult = {
	uploadUrl: string;
	status: number;
	statusText: string;
};

type UploadRequestParams = {
	url: string;
	file: File;
	headers: Headers;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
};

type RetryExecutionParams = {
	maxAttempts: number;
	retryConfig: RetryConfig;
	execute: () => Promise<XhrUploadResult>;
};

function resolveMaxAttempts(retry?: undefined | true | number): number {
	if (typeof retry === "number") {
		return Math.max(1, retry);
	}

	if (retry === true) {
		return DEFAULT_RETRY_ATTEMPTS;
	}

	return 1;
}

function normalizeError(error: unknown): Error | DOMException {
	if (error instanceof DOMException || error instanceof Error) {
		return error;
	}

	return new Error("Upload failed with an unknown error");
}

async function executeWithRetries({
	maxAttempts,
	retryConfig,
	execute,
}: RetryExecutionParams): Promise<XhrUploadResult> {
	let attempt = 0;
	let lastError: Error | DOMException | undefined;

	while (attempt < maxAttempts) {
		try {
			return await execute();
		} catch (error) {
			const normalizedError = normalizeError(error);
			lastError = normalizedError;
			attempt++;

			if (
				normalizedError instanceof DOMException &&
				normalizedError.name === "AbortError"
			) {
				throw normalizedError;
			}

			if (attempt >= maxAttempts) {
				throw normalizedError;
			}

			const delayMs = calculateRetryDelay(attempt, retryConfig);
			await sleep(delayMs);
		}
	}

	throw lastError ?? new Error("Upload failed: no attempts made");
}

function createUploadRequest({
	url,
	file,
	headers,
	onProgress,
	signal,
}: UploadRequestParams): Promise<XhrUploadResult> {
	return new Promise((resolve, reject) => {
		const xhr = new XhrFactory(signal);
		const requestHeaders = { ...headers };
		xhr.open("PUT", url, true);
		if (file.type && !requestHeaders["content-type"]) {
			requestHeaders["content-type"] = file.type;
		}
		xhr.appendHeaders(requestHeaders);
		xhr.appendProgressHandler(onProgress);
		xhr.appendErrorHandler((_status, statusText, cleanup) => {
			cleanup();
			reject(new Error(`Error occurred: ${statusText}`));
		});
		xhr.appendAbortHandler(() => {
			reject(new DOMException("Upload aborted", "AbortError"));
		});
		xhr.appendLoadHandler((success, status, statusText, cleanup) => {
			if (success) {
				cleanup();
				resolve({ uploadUrl: url, status, statusText });
				return;
			}
			cleanup();
			reject(new Error(`Error occurred: ${statusText}`));
		});
		xhr.send(file);
	});
}

/**
 * Uploads a file from the client to a given URL using XMLHttpRequest.
 */
export async function xhrUpload(
	url: string,
	file: File,
	options?: XhrUploadOptions,
): Promise<XhrUploadResult> {
	const {
		retry,
		headers = {},
		onProgress,
		signal,
		retryConfig = DEFAULT_RETRY_CONFIG,
	} = options ?? {};

	const maxAttempts = resolveMaxAttempts(retry);
	return executeWithRetries({
		maxAttempts,
		retryConfig,
		execute: () =>
			createUploadRequest({
				url,
				file,
				headers,
				onProgress,
				signal,
			}),
	});
}
