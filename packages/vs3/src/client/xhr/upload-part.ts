import {
	DEFAULT_RETRY_CONFIG,
	type RetryConfig,
} from "../../core/resilience/retry";
import { executeWithRetries, resolveMaxAttempts } from "./retry-utils";
import { XhrFactory } from "./xhr-factory";

export type XhrUploadPartResult = { partNumber: number; eTag: string };

type UploadPartParams = {
	presignedUrl: string;
	partNumber: number;
	body: Blob;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	onProgress?: (loaded: number) => void;
};

function createPartUploadRequest(
	params: UploadPartParams,
): Promise<XhrUploadPartResult> {
	return new Promise((resolve, reject) => {
		const xhr = new XhrFactory(params.signal);
		xhr.open("PUT", params.presignedUrl, true);
		xhr.appendHeaders(params.headers);

		xhr.appendRawProgressHandler(params.onProgress);

		xhr.appendErrorHandler((_status, statusText, cleanup) => {
			cleanup();
			reject(new Error(`Part upload error: ${statusText}`));
		});

		xhr.appendAbortHandler(() => {
			reject(new DOMException("Part upload aborted", "AbortError"));
		});

		xhr.appendLoadHandler((success, _status, statusText, cleanup) => {
			if (success) {
				const eTag = xhr.getResponseHeader("etag");
				cleanup();
				if (!eTag) {
					reject(
						new Error("S3 did not return an ETag header for the uploaded part"),
					);
					return;
				}
				resolve({ partNumber: params.partNumber, eTag });
				return;
			}
			cleanup();
			reject(new Error(`Part upload failed: ${statusText}`));
		});

		xhr.send(params.body);
	});
}

export function xhrUploadPart(
	params: UploadPartParams,
	options?: { retry?: undefined | true | number; retryConfig?: RetryConfig },
): Promise<XhrUploadPartResult> {
	const { retry, retryConfig = DEFAULT_RETRY_CONFIG } = options ?? {};
	const maxAttempts = resolveMaxAttempts(retry);

	return executeWithRetries({
		maxAttempts,
		retryConfig,
		execute: () => createPartUploadRequest(params),
		unknownErrorMessage: "Part upload failed with an unknown error",
		noAttemptsMessage: "Part upload failed: no attempts made",
		signal: params.signal,
		abortMessage: "Part upload aborted",
	});
}
