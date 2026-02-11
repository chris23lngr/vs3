import { type Ref, readonly, ref } from "vue";
import type { StorageError } from "../../../core/error/error";
import type { InferredTypes } from "../../../types/infer";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type {
	BaseStorageClient,
	MultipartUploadOptions,
	MultipartUploadResult,
} from "../../create-client";
import { resolveThrowOnError } from "../../shared/resolve-throw-on-error";
import { normalizeStorageError } from "../../shared/storage-error";

type MultipartUploadStatus = "idle" | "loading" | "success" | "error";

type MultipartUploadState = {
	isLoading: boolean;
	progress: number;
	error: StorageError | null;
	data: MultipartUploadResult | null;
	status: MultipartUploadStatus;
};

type MultipartUploadCallbacks = {
	onProgress?: (progress: number) => void;
	onSuccess?: (result: MultipartUploadResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError: boolean;
};

type MultipartUploadActions = {
	reset: () => void;
	setLoading: () => void;
	setProgress: (value: number) => void;
	setSuccess: (value: MultipartUploadResult) => void;
	setFailure: (value: StorageError) => void;
};

type MultipartUploadExecution<T extends InferredTypes> = {
	client: BaseStorageClient<T>;
	file: File;
	metadata: StandardSchemaV1.InferInput<T["metadata"]>;
	actions: MultipartUploadActions;
	callbacks: MultipartUploadCallbacks;
	uploadOptions?: Partial<MultipartUploadOptions>;
	abortController: AbortController;
};

export interface UseMultipartUploadOptions {
	onProgress?: (progress: number) => void;
	onSuccess?: (result: MultipartUploadResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError?: boolean;
	partSize?: number;
	concurrency?: number;
}

type UseMultipartUploadReturn<T extends InferredTypes> = {
	state: Readonly<Ref<MultipartUploadState>>;
	upload: (
		file: File,
		metadata: StandardSchemaV1.InferInput<T["metadata"]>,
	) => Promise<void>;
	abort: () => void;
	reset: () => void;
};

type UseMultipartUploadHook<T extends InferredTypes> = (
	options?: UseMultipartUploadOptions,
) => UseMultipartUploadReturn<T>;

const initialState: MultipartUploadState = {
	isLoading: false,
	progress: 0,
	error: null,
	data: null,
	status: "idle",
};

function createMultipartUploadActions(
	state: Ref<MultipartUploadState>,
): MultipartUploadActions {
	return {
		reset: () => {
			state.value = { ...initialState };
		},
		setLoading: () => {
			state.value = { ...initialState, isLoading: true, status: "loading" };
		},
		setProgress: (value: number) => {
			state.value = { ...state.value, progress: value };
		},
		setSuccess: (value: MultipartUploadResult) => {
			state.value = {
				...state.value,
				isLoading: false,
				data: value,
				error: null,
				status: "success",
			};
		},
		setFailure: (value: StorageError) => {
			state.value = {
				...state.value,
				isLoading: false,
				error: value,
				data: null,
				status: "error",
			};
		},
	};
}

async function executeMultipartUpload<T extends InferredTypes>(
	input: MultipartUploadExecution<T>,
): Promise<void> {
	const {
		client,
		file,
		metadata,
		actions,
		callbacks,
		uploadOptions,
		abortController,
	} = input;
	try {
		actions.setLoading();
		const result = await client.multipartUpload(file, metadata, {
			...uploadOptions,
			signal: abortController.signal,
			onProgress: (value) => {
				actions.setProgress(value);
				callbacks.onProgress?.(value);
			},
		});
		actions.setSuccess(result);
		callbacks.onSuccess?.(result);
	} catch (error) {
		const storageError = normalizeStorageError(
			error,
			"Multipart upload failed unexpectedly",
		);
		actions.setFailure(storageError);
		callbacks.onError?.(storageError);
		if (callbacks.throwOnError) {
			throw storageError;
		}
	}
}

function useMultipartUploadInternal<T extends InferredTypes>(
	client: BaseStorageClient<T>,
	options?: UseMultipartUploadOptions,
): UseMultipartUploadReturn<T> {
	const state = ref<MultipartUploadState>({ ...initialState });
	const actions = createMultipartUploadActions(state);
	const shouldThrow = resolveThrowOnError(
		options?.throwOnError,
		client["~options"].throwOnError,
	);

	let abortController = new AbortController();

	const uploadOptions: Partial<MultipartUploadOptions> | undefined =
		options?.partSize !== undefined || options?.concurrency !== undefined
			? { partSize: options?.partSize, concurrency: options?.concurrency }
			: undefined;

	const upload = async (
		file: File,
		metadata: StandardSchemaV1.InferInput<T["metadata"]>,
	): Promise<void> => {
		abortController.abort();
		abortController = new AbortController();
		await executeMultipartUpload({
			client,
			file,
			metadata,
			actions,
			callbacks: {
				onProgress: options?.onProgress,
				onSuccess: options?.onSuccess,
				onError: options?.onError,
				throwOnError: shouldThrow,
			},
			uploadOptions,
			abortController,
		});
	};

	const abort = (): void => {
		abortController.abort();
	};

	return { state: readonly(state), upload, abort, reset: actions.reset };
}

export function createUseMultipartUpload<T extends InferredTypes>(
	client: BaseStorageClient<T>,
): UseMultipartUploadHook<T> {
	return function useMultipartUpload(
		options?: UseMultipartUploadOptions,
	): UseMultipartUploadReturn<T> {
		return useMultipartUploadInternal(client, options);
	};
}
