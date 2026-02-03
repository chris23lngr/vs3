import type { FileInfo } from "../types/file";
import type { StandardSchemaV1 } from "../types/standard-schema";

export type ClientSchema = StandardSchemaV1 | undefined;

export type ClientHeaders =
	| HeadersInit
	| (() => HeadersInit | Promise<HeadersInit>);

export type StorageClientOptions<M extends ClientSchema = ClientSchema> = {
	baseUrl?: string;
	apiPath?: string;
	fetch?: typeof fetch;
	headers?: ClientHeaders;
	metadataSchema?: M;
	validateMetadata?: boolean;
	retry?: RetryOptions;
	hooks?: ClientHooks;
};

export type ClientRequestOptions = {
	headers?: HeadersInit;
	signal?: AbortSignal;
	validateMetadata?: boolean;
	retry?: RetryOptions;
	hooks?: ClientHooks;
};

export type ErrorContract = {
	code: string;
	message: string;
	details?: unknown;
};

export type ErrorResponse = {
	error: ErrorContract;
};

export type RetryOptions = {
	attempts: number;
	delayMs?: number;
	maxDelayMs?: number;
	strategy?: "linear" | "exponential";
	jitter?: boolean;
	retryOn?: (ctx: RetryContext) => boolean | Promise<boolean>;
};

export type RetryContext = {
	attempt: number;
	error?: unknown;
	response?: Response;
};

export type ClientHooks = {
	onRequest?: (ctx: RequestHookContext) => void | Promise<void>;
	onResponse?: (ctx: ResponseHookContext) => void | Promise<void>;
	onError?: (ctx: ErrorHookContext) => void | Promise<void>;
};

export type RequestHookContext = {
	url: string;
	method: string;
	headers: Headers;
	body?: unknown;
};

export type ResponseHookContext = {
	url: string;
	method: string;
	headers: Headers;
	body?: unknown;
	response: Response;
	data: unknown;
};

export type ErrorHookContext = {
	url: string;
	method: string;
	headers: Headers;
	body?: unknown;
	error: unknown;
};

export type WithClientMetadata<
	BaseBody,
	M extends ClientSchema,
	RequireMetadata extends boolean = true,
> = RequireMetadata extends true
	? M extends StandardSchemaV1
		? BaseBody & {
				metadata: StandardSchemaV1.InferInput<NonNullable<M>>;
			}
		: BaseBody
	: BaseBody;

export type UploadInput<M extends ClientSchema> = WithClientMetadata<
	{ file: File },
	M,
	true
>;

export type UploadUrlInput<M extends ClientSchema> = WithClientMetadata<
	{ file: FileInfo },
	M,
	true
>;

export type DeleteInput<M extends ClientSchema> = WithClientMetadata<
	{ key: string },
	M,
	true
>;

export type DownloadInput<M extends ClientSchema> = WithClientMetadata<
	{ key: string },
	M,
	false
>;

export type UploadResult = {
	uploadUrl: string;
	response: Response;
};

export type StorageClient<M extends ClientSchema = ClientSchema> = {
	uploadUrl: (
		input: UploadUrlInput<M>,
		options?: ClientRequestOptions,
	) => Promise<{ uploadUrl: string }>;
	upload: (
		input: UploadInput<M>,
		options?: ClientRequestOptions,
	) => Promise<UploadResult>;
	delete: (
		input: DeleteInput<M>,
		options?: ClientRequestOptions,
	) => Promise<{ success: boolean }>;
	downloadUrl: (
		input: DownloadInput<M>,
		options?: ClientRequestOptions,
	) => Promise<{ downloadUrl: string }>;
};
