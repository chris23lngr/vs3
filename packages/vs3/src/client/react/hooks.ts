import { useStore } from "@nanostores/react";
import { useCallback, useMemo, useState } from "react";
import { StorageClientResponseError } from "../errors";
import type {
	ClientRequestOptions,
	ClientSchema,
	DebugEvent,
	DebugOptions,
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

function appendHeaders(target: Headers, source?: HeadersInit) {
	if (!source) {
		return;
	}
	if (source instanceof Headers) {
		source.forEach((value, key) => {
			target.set(key, value);
		});
		return;
	}
	if (Array.isArray(source)) {
		for (const [key, value] of source) {
			target.set(key, value);
		}
		return;
	}
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) {
			target.set(key, String(value));
		}
	}
}

function mergeHeaders(defaults?: HeadersInit, overrides?: HeadersInit) {
	const headers = new Headers();
	appendHeaders(headers, defaults);
	appendHeaders(headers, overrides);
	return headers;
}

type DebugConfig = {
	logger: (event: DebugEvent) => void;
	includeHeaders: boolean;
	includeBody: boolean;
	includeResponseBody: boolean;
	maxBodyLength: number;
};

function normalizeDebug(
	input?: DebugOptions | boolean,
): DebugOptions | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (typeof input === "boolean") {
		return { enabled: input };
	}
	return input;
}

function resolveDebug(
	overrides?: DebugOptions | boolean,
): DebugConfig | undefined {
	const next = normalizeDebug(overrides);
	if (next?.enabled === false) {
		return undefined;
	}
	const enabled = next?.enabled ?? false;
	if (!enabled) {
		return undefined;
	}
	const logger =
		next?.logger ??
		((event: DebugEvent) => {
			if (typeof console !== "undefined" && console.debug) {
				console.debug("[vs3]", event);
				return;
			}
			if (typeof console !== "undefined") {
				console.log("[vs3]", event);
			}
		});
	return {
		logger,
		includeHeaders: next?.includeHeaders ?? true,
		includeBody: next?.includeBody ?? false,
		includeResponseBody: next?.includeResponseBody ?? false,
		maxBodyLength: next?.maxBodyLength ?? 2_000,
	};
}

function headersToObject(headers: Headers) {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key] = value;
	});
	return out;
}

function parseResponseHeaders(raw: string) {
	const out: Record<string, string> = {};
	if (!raw) {
		return out;
	}
	for (const line of raw.trim().split(/[\r\n]+/)) {
		const index = line.indexOf(":");
		if (index === -1) {
			continue;
		}
		const key = line.slice(0, index).trim().toLowerCase();
		const value = line.slice(index + 1).trim();
		if (key) {
			out[key] = value;
		}
	}
	return out;
}

function truncateBody(input: unknown, max: number) {
	if (typeof input === "string") {
		return input.length > max ? `${input.slice(0, max)}…` : input;
	}
	return input;
}

function emitDebug(debug: DebugConfig | undefined, event: DebugEvent) {
	if (!debug) {
		return;
	}
	debug.logger(event);
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

function formatHookError(error: unknown) {
	if (error instanceof StorageClientResponseError) {
		return {
			name: error.name,
			message: error.message,
			status: error.status,
			statusText: error.statusText,
			url: error.url,
			errorCode: error.errorCode,
			errorDetails: error.errorDetails,
			body: error.body,
		};
	}
	if (error instanceof DOMException) {
		return {
			name: error.name,
			message: error.message,
		};
	}
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
		};
	}
	return error;
}

function buildNetworkErrorBody(url?: string) {
	return {
		error: {
			code: "NETWORK_ERROR",
			message:
				"Network error while uploading. This is commonly caused by a CORS configuration issue on the storage bucket.",
			details: {
				likelyCors: true,
				hint: "Check bucket CORS rules for PUT/OPTIONS and allow your app origin.",
				url,
			},
		},
	};
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
				const debug = resolveDebug(options?.debug);
				const xhr = new XMLHttpRequest();
				xhr.open("PUT", url, true);

				const headers = new Headers(options?.uploadHeaders);
				if (file.type && !headers.has("content-type")) {
					headers.set("content-type", file.type);
				}
				headers.forEach((value, key) => {
					xhr.setRequestHeader(key, value);
				});

				emitDebug(debug, {
					scope: "upload",
					phase: "request",
					url,
					method: "PUT",
					headers: debug?.includeHeaders ? headersToObject(headers) : undefined,
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
					emitDebug(debug, {
						scope: "upload",
						phase: "progress",
						url,
						method: "PUT",
						extra: {
							loaded: progress.loaded,
							total: progress.total,
							percent: progress.percent,
						},
					});
				};

				const cleanup = () => {
					if (options?.signal && abortHandler) {
						options.signal.removeEventListener("abort", abortHandler);
					}
				};

				xhr.onreadystatechange = () => {
					emitDebug(debug, {
						scope: "upload",
						phase: "state",
						url,
						method: "PUT",
						status: xhr.status,
						statusText: xhr.statusText,
						extra: {
							readyState: xhr.readyState,
							responseURL: xhr.responseURL,
						},
					});
				};

				xhr.onerror = () => {
					const rawBody = parseResponseText(xhr.responseText);
					const errorBody =
						xhr.status === 0 && !rawBody
							? buildNetworkErrorBody(xhr.responseURL || url)
							: rawBody;
					const contract = isErrorResponse(errorBody) ? errorBody.error : undefined;
					emitDebug(debug, {
						scope: "upload",
						phase: "error",
						url,
						method: "PUT",
						status: xhr.status,
						statusText: xhr.statusText,
						headers: debug?.includeHeaders
							? parseResponseHeaders(xhr.getAllResponseHeaders())
							: undefined,
						body: debug?.includeResponseBody
							? truncateBody(errorBody, debug.maxBodyLength)
							: undefined,
						extra: {
							responseURL: xhr.responseURL,
							readyState: xhr.readyState,
						},
					});
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
					emitDebug(debug, {
						scope: "upload",
						phase: "error",
						url,
						method: "PUT",
						status: xhr.status,
						statusText: xhr.statusText,
						extra: {
							aborted: true,
							readyState: xhr.readyState,
						},
					});
					cleanup();
					reject(new DOMException("Upload aborted", "AbortError"));
				};

				xhr.onload = () => {
					const response = parseResponseText(xhr.responseText);
					if (xhr.status >= 200 && xhr.status < 300) {
						emitDebug(debug, {
							scope: "upload",
							phase: "response",
							url,
							method: "PUT",
							status: xhr.status,
							statusText: xhr.statusText,
							headers: debug?.includeHeaders
								? parseResponseHeaders(xhr.getAllResponseHeaders())
								: undefined,
							body: debug?.includeResponseBody
								? truncateBody(response, debug.maxBodyLength)
								: undefined,
							extra: {
								responseURL: xhr.responseURL,
							},
						});
						cleanup();
						resolve({ uploadUrl: url, status: xhr.status, response });
						return;
					}
					const errorBody =
						xhr.status === 0 && !response
							? buildNetworkErrorBody(xhr.responseURL || url)
							: response;
					const contract = isErrorResponse(errorBody) ? errorBody.error : undefined;
					emitDebug(debug, {
						scope: "upload",
						phase: "error",
						url,
						method: "PUT",
						status: xhr.status,
						statusText: xhr.statusText,
						headers: debug?.includeHeaders
							? parseResponseHeaders(xhr.getAllResponseHeaders())
							: undefined,
						body: debug?.includeResponseBody
							? truncateBody(errorBody, debug.maxBodyLength)
							: undefined,
						extra: {
							responseURL: xhr.responseURL,
						},
					});
					cleanup();
					reject(
						new StorageClientResponseError(
							xhr.status,
							errorBody,
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
				const { uploadUrl, uploadHeaders } = await client.uploadUrl(
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

				const mergedUploadHeaders = mergeHeaders(
					uploadOptions?.uploadHeaders,
					uploadHeaders,
				);

				const result = await xhrUpload(uploadUrl, input.file, {
					...uploadOptions,
					uploadHeaders: mergedUploadHeaders,
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
				setError(formatHookError(err));
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
				setError(formatHookError(err));
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
				setError(formatHookError(err));
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
