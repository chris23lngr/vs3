import { type Ref, readonly, ref } from "vue";
import type { StorageError } from "../../../core/error/error";
import type { S3Encryption } from "../../../types/encryption";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type {
	BaseStorageClient,
	DownloadFileResult,
	DownloadMode,
} from "../../create-client";
import { resolveThrowOnError } from "../../shared/resolve-throw-on-error";
import { normalizeStorageError } from "../../shared/storage-error";

type DownloadStatus = "idle" | "loading" | "success" | "error";

type DownloadState = {
	isLoading: boolean;
	error: StorageError | null;
	data: DownloadFileResult | null;
	status: DownloadStatus;
};

type DownloadOptions = Partial<{
	expiresIn: number;
	encryption: S3Encryption;
	mode: DownloadMode;
}>;

type DownloadCallbacks = {
	onSuccess?: (result: DownloadFileResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError: boolean;
};

type DownloadActions = {
	reset: () => void;
	setLoading: () => void;
	setSuccess: (value: DownloadFileResult) => void;
	setFailure: (value: StorageError) => void;
};

type DownloadExecution<M extends StandardSchemaV1> = {
	client: BaseStorageClient<M>;
	key: string;
	downloadOptions?: DownloadOptions;
	actions: DownloadActions;
	callbacks: DownloadCallbacks;
};

export interface UseDownloadOptions {
	onSuccess?: (result: DownloadFileResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError?: boolean;
}

type UseDownloadReturn = {
	state: Readonly<Ref<DownloadState>>;
	download: (
		key: string,
		downloadOptions?: DownloadOptions,
	) => Promise<DownloadFileResult | undefined>;
	reset: () => void;
};

type UseDownloadHook = (options?: UseDownloadOptions) => UseDownloadReturn;

const initialDownloadState: DownloadState = {
	isLoading: false,
	error: null,
	data: null,
	status: "idle",
};

function createDownloadActions(state: Ref<DownloadState>): DownloadActions {
	return {
		reset: () => {
			state.value = { ...initialDownloadState };
		},
		setLoading: () => {
			state.value = {
				...initialDownloadState,
				isLoading: true,
				status: "loading",
			};
		},
		setSuccess: (value: DownloadFileResult) => {
			state.value = {
				isLoading: false,
				error: null,
				data: value,
				status: "success",
			};
		},
		setFailure: (value: StorageError) => {
			state.value = {
				isLoading: false,
				error: value,
				data: null,
				status: "error",
			};
		},
	};
}

async function executeDownload<M extends StandardSchemaV1>(
	input: DownloadExecution<M>,
): Promise<DownloadFileResult | undefined> {
	const { client, key, downloadOptions, actions, callbacks } = input;
	try {
		actions.setLoading();
		const result = await client.downloadFile(key, downloadOptions);
		actions.setSuccess(result);
		callbacks.onSuccess?.(result);
		return result;
	} catch (error) {
		const storageError = normalizeStorageError(
			error,
			"Download failed unexpectedly",
		);
		actions.setFailure(storageError);
		callbacks.onError?.(storageError);
		if (callbacks.throwOnError) {
			throw storageError;
		}
		return undefined;
	}
}

function useDownloadInternal<M extends StandardSchemaV1>(
	client: BaseStorageClient<M>,
	options?: UseDownloadOptions,
): UseDownloadReturn {
	const state = ref<DownloadState>({ ...initialDownloadState });
	const actions = createDownloadActions(state);
	const shouldThrow = resolveThrowOnError(
		options?.throwOnError,
		client["~options"].throwOnError,
	);

	const download = async (
		key: string,
		downloadOptions?: DownloadOptions,
	): Promise<DownloadFileResult | undefined> => {
		return executeDownload({
			client,
			key,
			downloadOptions,
			actions,
			callbacks: {
				onSuccess: options?.onSuccess,
				onError: options?.onError,
				throwOnError: shouldThrow,
			},
		});
	};

	return { state: readonly(state), download, reset: actions.reset };
}

export function createUseDownload<M extends StandardSchemaV1>(
	client: BaseStorageClient<M>,
): UseDownloadHook {
	return function useDownload(options?: UseDownloadOptions): UseDownloadReturn {
		return useDownloadInternal(client, options);
	};
}
