import { useCallback, useMemo, useRef, useState } from "react";
import type { StorageError } from "../../../core/error/error";
import type { InferredTypes } from "../../../types/infer";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type {
	BaseStorageClient,
	MultipartUploadOptions,
	MultipartUploadResult,
} from "../../create-client";
import { resolveThrowOnError } from "../../shared/resolve-throw-on-error";
import { normalizeStorageError } from "./storage-error";

type MultipartUploadStatus = "idle" | "loading" | "success" | "error";

type MultipartUploadState = {
	isLoading: boolean;
	progress: number;
	error: StorageError | null;
	data: MultipartUploadResult | null;
	status: MultipartUploadStatus;
};

type MultipartUploadStateActions = {
	reset: () => void;
	setLoading: () => void;
	setProgress: (value: number) => void;
	setSuccess: (value: MultipartUploadResult) => void;
	setFailure: (value: StorageError) => void;
};

type MultipartUploadCallbacks = {
	onProgress?: (progress: number) => void;
	onSuccess?: (result: MultipartUploadResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError: boolean;
};

type MultipartUploadExecution<T extends InferredTypes> = {
	client: BaseStorageClient<T>;
	file: File;
	metadata: StandardSchemaV1.InferInput<T["metadata"]>;
	actions: MultipartUploadStateActions;
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
	state: MultipartUploadState;
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

function useMultipartUploadState(): {
	state: MultipartUploadState;
	actions: MultipartUploadStateActions;
} {
	const [state, setState] = useState<MultipartUploadState>(initialState);

	const reset = useCallback((): void => {
		setState(initialState);
	}, []);

	const setLoading = useCallback((): void => {
		setState((current) => ({ ...current, status: "loading", isLoading: true }));
	}, []);

	const setProgress = useCallback((value: number): void => {
		setState((current) => ({ ...current, progress: value }));
	}, []);

	const setSuccess = useCallback((value: MultipartUploadResult): void => {
		setState((current) => ({
			...current,
			data: value,
			isLoading: false,
			status: "success",
		}));
	}, []);

	const setFailure = useCallback((value: StorageError): void => {
		setState((current) => ({
			...current,
			error: value,
			isLoading: false,
			status: "error",
		}));
	}, []);

	const actions = useMemo<MultipartUploadStateActions>(
		() => ({
			reset,
			setLoading,
			setProgress,
			setSuccess,
			setFailure,
		}),
		[reset, setLoading, setProgress, setSuccess, setFailure],
	);

	return {
		state,
		actions,
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
		actions.reset();
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

function useMultipartUploadHandler<T extends InferredTypes>(
	client: BaseStorageClient<T>,
	callbacks: MultipartUploadCallbacks,
	actions: MultipartUploadStateActions,
	abortControllerRef: React.RefObject<AbortController>,
	uploadOptions?: Partial<MultipartUploadOptions>,
): (
	file: File,
	metadata: StandardSchemaV1.InferInput<T["metadata"]>,
) => Promise<void> {
	return useCallback(
		async (
			file: File,
			metadata: StandardSchemaV1.InferInput<T["metadata"]>,
		): Promise<void> => {
			const abortController = new AbortController();
			(abortControllerRef as React.MutableRefObject<AbortController>).current =
				abortController;
			await executeMultipartUpload({
				client,
				file,
				metadata,
				actions,
				callbacks,
				uploadOptions,
				abortController,
			});
		},
		[client, actions, callbacks, abortControllerRef, uploadOptions],
	);
}

function useMultipartUploadInternal<T extends InferredTypes>(
	client: BaseStorageClient<T>,
	options?: UseMultipartUploadOptions,
): UseMultipartUploadReturn<T> {
	const { onProgress, onSuccess, onError, throwOnError, partSize, concurrency } =
		options ?? {};
	const { state, actions } = useMultipartUploadState();
	const abortControllerRef = useRef<AbortController>(new AbortController());

	const shouldThrow = resolveThrowOnError(
		throwOnError,
		client["~options"].throwOnError,
	);

	const uploadOptions = useMemo<Partial<MultipartUploadOptions> | undefined>(
		() =>
			partSize !== undefined || concurrency !== undefined
				? { partSize, concurrency }
				: undefined,
		[partSize, concurrency],
	);

	const callbacks = useMemo<MultipartUploadCallbacks>(
		() => ({ onProgress, onSuccess, onError, throwOnError: shouldThrow }),
		[onProgress, onSuccess, onError, shouldThrow],
	);

	const upload = useMultipartUploadHandler(
		client,
		callbacks,
		actions,
		abortControllerRef,
		uploadOptions,
	);

	const abort = useCallback((): void => {
		abortControllerRef.current.abort();
	}, []);

	return { state, upload, abort, reset: actions.reset };
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
