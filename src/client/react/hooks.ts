import { useStore } from "@nanostores/react";
import { useCallback, useMemo, useState } from "react";
import { StorageClientResponseError } from "../errors";
import type {
	ClientRequestOptions,
	ClientSchema,
	ErrorResponse,
	StorageClient,
	StorageClientOptions,
	UploadInput,
} from "../types";
import { $storageClient, initStorageClient } from "./store";
import type {
	DeleteHook,
	DownloadHook,
	HookStatus,
	UploadHook,
	UploadHookOptions,
	UploadProgress,
	XhrUploadResult,
} from "./types";

function getRetryDelay(attempt: number, options?: UploadHookOptions["retry"]) {
	if (!options) {
		return 0;
	}
	const base = options.delayMs ?? 250;
	const strategy = options.strategy ?? "exponential";
	const max = options.maxDelayMs ?? 5_000;
	const delay =
		strategy === "linear"
			? base * attempt
			: Math.min(max, base * 2 ** (attempt - 1));
	if (!options.jitter) {
		return delay;
	}
	return delay + Math.random() * delay * 0.1;
}

async function sleep(ms: number) {
	if (ms <= 0) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, ms));
}

type ClientOrOptions<M extends ClientSchema> =
	| StorageClient<M>
	| StorageClientOptions<M>;

function isClient<M extends ClientSchema>(
	value: ClientOrOptions<M>,
): value is StorageClient<M> {
	return typeof value === "object" && value !== null && "uploadUrl" in value;
}

function useResolvedClient<M extends ClientSchema>(
	input?: ClientOrOptions<M>,
): StorageClient<M> {
	const client = useStore($storageClient);

	if (input && isClient(input)) {
		return input;
	}

	if (!client) {
		if (input) {
			return initStorageClient(input);
		}
		throw new Error(
			"Storage client is not initialized. Call initStorageClient() before using hooks.",
		);
	}
	return client as StorageClient<M>;
}

function parseResponseText(text: string | null) {
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function isErrorResponse(data: unknown): data is ErrorResponse {
	if (!data || typeof data !== "object") {
		return false;
	}
	return (
		"error" in data &&
		typeof (data as any).error?.code === "string" &&
		typeof (data as any).error?.message === "string"
	);
}

async function xhrUpload(
	url: string,
	file: File,
	options?: UploadHookOptions,
): Promise<XhrUploadResult> {
	let attempt = 0;
	const maxAttempts = options?.retry?.attempts ?? 0;
	while (true) {
		attempt += 1;
		try {
			return await new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open("PUT", url, true);

				const headers = new Headers(options?.uploadHeaders);
				if (file.type && !headers.has("content-type")) {
					headers.set("content-type", file.type);
				}
				headers.forEach((value, key) => {
					xhr.setRequestHeader(key, value);
				});

				if (options?.withCredentials) {
					xhr.withCredentials = true;
				}

				xhr.upload.onprogress = (event) => {
					if (!options?.onProgress) {
						return;
					}
					const progress: UploadProgress = {
						loaded: event.loaded,
					};
					if (event.lengthComputable) {
						progress.total = event.total;
						progress.percent = event.total ? event.loaded / event.total : undefined;
					}
					options.onProgress(progress);
				};

				const cleanup = () => {
					if (options?.signal && abortHandler) {
						options.signal.removeEventListener("abort", abortHandler);
					}
				};

				xhr.onerror = () => {
					const errorBody = parseResponseText(xhr.responseText);
					const contract = isErrorResponse(errorBody) ? errorBody.error : undefined;
					cleanup();
					reject(
						new StorageClientResponseError(
							xhr.status || 0,
							errorBody,
							xhr.statusText,
							xhr.responseURL,
							contract?.code,
							contract?.details,
						),
					);
				};

				xhr.onabort = () => {
					cleanup();
					reject(new DOMException("Upload aborted", "AbortError"));
				};

				xhr.onload = () => {
					const response = parseResponseText(xhr.responseText);
					if (xhr.status >= 200 && xhr.status < 300) {
						cleanup();
						resolve({ uploadUrl: url, status: xhr.status, response });
						return;
					}
					const contract = isErrorResponse(response) ? response.error : undefined;
					cleanup();
					reject(
						new StorageClientResponseError(
							xhr.status,
							response,
							xhr.statusText,
							xhr.responseURL,
							contract?.code,
							contract?.details,
						),
					);
				};

				let abortHandler: (() => void) | undefined;
				if (options?.signal) {
					if (options.signal.aborted) {
						xhr.abort();
						return;
					}
					abortHandler = () => {
						xhr.abort();
					};
					options.signal.addEventListener("abort", abortHandler, {
						once: true,
					});
				}

				xhr.send(file);
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				throw error;
			}
			const retryOn = options?.retry?.retryOn;
			const canRetry =
				attempt <= maxAttempts &&
				(await (retryOn ? retryOn({ attempt, error }) : true));
			if (!canRetry) {
				throw error;
			}
			await sleep(getRetryDelay(attempt, options?.retry));
		}
	}
}

export function useStorageClient<M extends ClientSchema>(
	input?: ClientOrOptions<M>,
) {
	return useResolvedClient(input);
}

export function useUpload<M extends ClientSchema>(
	input?: ClientOrOptions<M>,
): UploadHook<M> {
	const client = useResolvedClient(input);
	const [status, setStatus] = useState<HookStatus>("idle");
	const [error, setError] = useState<unknown>(undefined);
	const [data, setData] = useState<XhrUploadResult | undefined>(undefined);
	const [progress, setProgress] = useState<UploadProgress | undefined>(
		undefined,
	);

	const upload = useCallback(
		async (input: UploadInput<M>, uploadOptions?: UploadHookOptions) => {
			setStatus("loading");
			setError(undefined);
			setData(undefined);
			setProgress(undefined);

			try {
				const { uploadUrl } = await client.uploadUrl(
					{
						...(input as any),
						file: {
							name: input.file.name,
							size: input.file.size,
							contentType: input.file.type,
						},
					},
					uploadOptions,
				);

				const result = await xhrUpload(uploadUrl, input.file, {
					...uploadOptions,
					onProgress: (next) => {
						setProgress(next);
						uploadOptions?.onProgress?.(next);
					},
				});

				setStatus("success");
				setData(result);
				return result;
			} catch (err) {
				setStatus("error");
				setError(err);
				throw err;
			}
		},
		[client],
	);

	const reset = useCallback(() => {
		setStatus("idle");
		setError(undefined);
		setData(undefined);
		setProgress(undefined);
	}, []);

	return useMemo(
		() => ({
			upload,
			status,
			progress,
			error,
			data,
			reset,
		}),
		[upload, status, progress, error, data, reset],
	);
}

export function useDelete<M extends ClientSchema>(
	input?: ClientOrOptions<M>,
): DeleteHook<M> {
	const client = useResolvedClient(input);
	const [status, setStatus] = useState<HookStatus>("idle");
	const [error, setError] = useState<unknown>(undefined);
	const [data, setData] = useState<{ success: boolean } | undefined>(undefined);

	const deleteFile = useCallback(
		async (
			input: Parameters<typeof client.delete>[0],
			requestOptions?: ClientRequestOptions,
		) => {
			setStatus("loading");
			setError(undefined);
			setData(undefined);
			try {
				const result = await client.delete(input, requestOptions);
				setStatus("success");
				setData(result);
				return result;
			} catch (err) {
				setStatus("error");
				setError(err);
				throw err;
			}
		},
		[client],
	);

	const reset = useCallback(() => {
		setStatus("idle");
		setError(undefined);
		setData(undefined);
	}, []);

	return useMemo(
		() => ({
			deleteFile,
			status,
			error,
			data,
			reset,
		}),
		[deleteFile, status, error, data, reset],
	);
}

export function useDownloadUrl<M extends ClientSchema>(
	input?: ClientOrOptions<M>,
): DownloadHook<M> {
	const client = useResolvedClient(input);
	const [status, setStatus] = useState<HookStatus>("idle");
	const [error, setError] = useState<unknown>(undefined);
	const [data, setData] = useState<{ downloadUrl: string } | undefined>(
		undefined,
	);

	const downloadUrl = useCallback(
		async (
			input: Parameters<typeof client.downloadUrl>[0],
			requestOptions?: ClientRequestOptions,
		) => {
			setStatus("loading");
			setError(undefined);
			setData(undefined);
			try {
				const result = await client.downloadUrl(input, requestOptions);
				setStatus("success");
				setData(result);
				return result;
			} catch (err) {
				setStatus("error");
				setError(err);
				throw err;
			}
		},
		[client],
	);

	const reset = useCallback(() => {
		setStatus("idle");
		setError(undefined);
		setData(undefined);
	}, []);

	return useMemo(
		() => ({
			downloadUrl,
			status,
			error,
			data,
			reset,
		}),
		[downloadUrl, status, error, data, reset],
	);
}
