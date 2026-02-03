import type {
	ClientRequestOptions,
	ClientSchema,
	DeleteInput,
	DownloadInput,
	UploadInput,
} from "../types";

export type HookStatus = "idle" | "loading" | "success" | "error";

export type UploadProgress = {
	loaded: number;
	total?: number;
	percent?: number;
};

export type UploadHookOptions = ClientRequestOptions & {
	uploadHeaders?: HeadersInit;
	withCredentials?: boolean;
	onProgress?: (progress: UploadProgress) => void;
};

export type XhrUploadResult = {
	uploadUrl: string;
	status: number;
	response: unknown;
};

export type UploadHook<M extends ClientSchema> = {
	upload: (
		input: UploadInput<M>,
		options?: UploadHookOptions,
	) => Promise<XhrUploadResult>;
	status: HookStatus;
	progress?: UploadProgress;
	error: unknown;
	data?: XhrUploadResult;
	reset: () => void;
};

export type DeleteHook<M extends ClientSchema> = {
	deleteFile: (
		input: DeleteInput<M>,
		options?: ClientRequestOptions,
	) => Promise<{ success: boolean }>;
	status: HookStatus;
	error: unknown;
	data?: { success: boolean };
	reset: () => void;
};

export type DownloadHook<M extends ClientSchema> = {
	downloadUrl: (
		input: DownloadInput<M>,
		options?: ClientRequestOptions,
	) => Promise<{ downloadUrl: string }>;
	status: HookStatus;
	error: unknown;
	data?: { downloadUrl: string };
	reset: () => void;
};
