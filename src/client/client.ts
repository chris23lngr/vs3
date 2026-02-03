import type { FileInfo } from "../types/file";
import type { StorageOptions } from "../types/options";
import type { Storage } from "../types/storage";
import { MetadataValidationError, StorageClientResponseError } from "./errors";
import type {
	ClientHeaders,
	ClientHooks,
	ClientRequestOptions,
	ClientSchema,
	DeleteInput,
	DownloadInput,
	ErrorHookContext,
	ErrorResponse,
	RequestHookContext,
	ResponseHookContext,
	RetryContext,
	RetryOptions,
	StorageClient,
	StorageClientOptions,
	UploadInput,
	UploadResult,
	UploadUrlInput,
} from "./types";

const defaultFetch = (...args: Parameters<typeof fetch>) => {
	if (!globalThis.fetch) {
		throw new Error(
			"Fetch is not available in this environment. Provide a fetch implementation in StorageClientOptions.",
		);
	}
	return globalThis.fetch(...args);
};

function joinPath(...parts: Array<string | undefined>) {
	const filtered = parts.filter((part) => part && part.length > 0) as string[];
	const stripped = filtered.map((part) => part.replace(/^\/+|\/+$/g, ""));
	return `/${stripped.filter(Boolean).join("/")}`;
}

function buildUrl(
	baseUrl: string | undefined,
	apiPath: string | undefined,
	path: string,
) {
	const combinedPath = joinPath(apiPath, path);
	if (!baseUrl) {
		return combinedPath;
	}
	return `${baseUrl.replace(/\/+$/g, "")}${combinedPath}`;
}

function normalizeFileInfo(file: File | FileInfo): FileInfo {
	if (file instanceof File) {
		return {
			name: file.name,
			size: file.size,
			contentType: file.type,
		};
	}
	return file;
}

async function readResponseBody(response: Response) {
	const text = await response.text();
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

async function resolveHeaders(source?: ClientHeaders) {
	if (!source) {
		return undefined;
	}
	return typeof source === "function" ? await source() : source;
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

function getRetryDelay(options: RetryOptions, attempt: number) {
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
	const jitter = Math.random() * delay * 0.1;
	return delay + jitter;
}

async function sleep(ms: number) {
	if (ms <= 0) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function shouldRetry(
	options: RetryOptions | undefined,
	ctx: RetryContext,
) {
	if (!options || options.attempts <= 0) {
		return false;
	}
	if (options.retryOn) {
		return options.retryOn(ctx);
	}
	if (ctx.error instanceof StorageClientResponseError) {
		return ctx.error.status >= 500;
	}
	return Boolean(ctx.error);
}

async function runHooks(hook?: (ctx: any) => void | Promise<void>, ctx?: any) {
	if (!hook) {
		return;
	}
	await hook(ctx);
}

async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions) {
	let attempt = 0;
	while (true) {
		attempt += 1;
		try {
			return await fn();
		} catch (error) {
			const ctx: RetryContext = { attempt, error };
			const canRetry = await shouldRetry(options, ctx);
			if (!canRetry || attempt > (options?.attempts ?? 0)) {
				throw error;
			}
			await sleep(getRetryDelay(options as RetryOptions, attempt));
		}
	}
}

function mergeHooks(
	defaultHooks?: ClientHooks,
	requestHooks?: ClientHooks,
): ClientHooks | undefined {
	if (!defaultHooks && !requestHooks) {
		return undefined;
	}
	return {
		onRequest: async (ctx: RequestHookContext) => {
			await runHooks(defaultHooks?.onRequest, ctx);
			await runHooks(requestHooks?.onRequest, ctx);
		},
		onResponse: async (ctx: ResponseHookContext) => {
			await runHooks(defaultHooks?.onResponse, ctx);
			await runHooks(requestHooks?.onResponse, ctx);
		},
		onError: async (ctx: ErrorHookContext) => {
			await runHooks(defaultHooks?.onError, ctx);
			await runHooks(requestHooks?.onError, ctx);
		},
	};
}

async function requestJson<T>(
	fetcher: typeof fetch,
	url: string,
	body: unknown,
	options?: ClientRequestOptions,
	defaultHeaders?: ClientHeaders,
	defaultHooks?: ClientHooks,
	defaultRetry?: RetryOptions,
) {
	const hooks = mergeHooks(defaultHooks, options?.hooks);
	const retry = options?.retry ?? defaultRetry;

	return withRetry(async () => {
		const resolvedDefaults = await resolveHeaders(defaultHeaders);
		const headers = mergeHeaders(resolvedDefaults, options?.headers);
		if (!headers.has("content-type")) {
			headers.set("content-type", "application/json");
		}
		const requestContext: RequestHookContext = {
			url,
			method: "POST",
			headers,
			body,
		};
		await hooks?.onRequest?.(requestContext);

		const response = await fetcher(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: options?.signal,
		});

		const data = await readResponseBody(response);
		if (!response.ok) {
			const contract = isErrorResponse(data) ? data.error : undefined;
			const error = new StorageClientResponseError(
				response.status,
				data,
				response.statusText,
				response.url,
				contract?.code,
				contract?.details,
			);
			await hooks?.onError?.({
				url,
				method: "POST",
				headers,
				body,
				error,
			});
			throw error;
		}

		await hooks?.onResponse?.({
			url,
			method: "POST",
			headers,
			body,
			response,
			data,
		});

		return data as T;
	}, retry);
}

async function validateMetadata<M extends ClientSchema>(
	schema: M | undefined,
	metadata: unknown,
) {
	if (!schema) {
		return metadata;
	}
	if (metadata == null) {
		throw new MetadataValidationError([{ message: "Metadata is required." }]);
	}
	const result = await schema["~standard"].validate(metadata, undefined);
	if (result.issues) {
		throw new MetadataValidationError(result.issues);
	}
	return result.value ?? metadata;
}

export function createStorageClient<M extends ClientSchema>(
	options: StorageClientOptions<M>,
): StorageClient<M> {
	const fetcher = options.fetch ?? defaultFetch;
	const baseUrl = options.baseUrl;
	const apiPath = options.apiPath;
	const schema = options.metadataSchema;
	const defaultValidate = options.validateMetadata ?? false;
	const defaultHeaders = options.headers;
	const defaultHooks = options.hooks;
	const defaultRetry = options.retry;

	const uploadUrl = async (
		input: UploadUrlInput<M>,
		requestOptions?: ClientRequestOptions,
	) => {
		const shouldValidate = requestOptions?.validateMetadata ?? defaultValidate;
		const metadata = shouldValidate
			? await validateMetadata(schema, (input as any).metadata)
			: (input as any).metadata;
		const payload = {
			...input,
			metadata,
		};
		const url = buildUrl(baseUrl, apiPath, "/generate-upload-url");
		return requestJson<{ uploadUrl: string }>(
			fetcher,
			url,
			payload,
			requestOptions,
			defaultHeaders,
			defaultHooks,
			defaultRetry,
		);
	};

	const upload = async (
		input: UploadInput<M>,
		requestOptions?: ClientRequestOptions,
	): Promise<UploadResult> => {
		const fileInfo = normalizeFileInfo(input.file);
		const { uploadUrl: presignedUrl } = await uploadUrl(
			{ ...(input as any), file: fileInfo },
			requestOptions,
		);
		const resolvedDefaults = await resolveHeaders(defaultHeaders);
		const headers = mergeHeaders(resolvedDefaults, requestOptions?.headers);
		if (input.file.type && !headers.has("content-type")) {
			headers.set("content-type", input.file.type);
		}
		const retry = requestOptions?.retry ?? defaultRetry;
		const response = await withRetry(async () => {
			const res = await fetcher(presignedUrl, {
				method: "PUT",
				body: input.file,
				headers,
				signal: requestOptions?.signal,
			});
			if (!res.ok) {
				const body = await readResponseBody(res);
				const contract = isErrorResponse(body) ? body.error : undefined;
				throw new StorageClientResponseError(
					res.status,
					body,
					res.statusText,
					res.url,
					contract?.code,
					contract?.details,
				);
			}
			return res;
		}, retry);

		return { uploadUrl: presignedUrl, response };
	};

	const deleteFile = async (
		input: DeleteInput<M>,
		requestOptions?: ClientRequestOptions,
	) => {
		const shouldValidate = requestOptions?.validateMetadata ?? defaultValidate;
		const metadata = shouldValidate
			? await validateMetadata(schema, (input as any).metadata)
			: (input as any).metadata;
		const payload = {
			...input,
			metadata,
		};
		const url = buildUrl(baseUrl, apiPath, "/delete");
		return requestJson<{ success: boolean }>(
			fetcher,
			url,
			payload,
			requestOptions,
			defaultHeaders,
			defaultHooks,
			defaultRetry,
		);
	};

	const downloadUrl = async (
		input: DownloadInput<M>,
		requestOptions?: ClientRequestOptions,
	) => {
		const url = buildUrl(baseUrl, apiPath, "/generate-download-url");
		return requestJson<{ downloadUrl: string }>(
			fetcher,
			url,
			input,
			requestOptions,
			defaultHeaders,
			defaultHooks,
			defaultRetry,
		);
	};

	return {
		uploadUrl: uploadUrl as StorageClient<M>["uploadUrl"],
		upload,
		delete: deleteFile as StorageClient<M>["delete"],
		downloadUrl: downloadUrl as StorageClient<M>["downloadUrl"],
	};
}

export function createStorageClientFromServer<O extends StorageOptions>(
	storage: Storage<O>,
	options?: Omit<StorageClientOptions<O["metadataSchema"]>, "metadataSchema">,
): StorageClient<O["metadataSchema"]> {
	return createStorageClient({
		...options,
		metadataSchema: storage["~options"].metadataSchema,
	});
}
