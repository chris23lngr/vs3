import { useCallback, useState } from "react";
import type { StorageError } from "../../../core/error/error";
import type { InferredTypes } from "../../../types/infer";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type { BaseStorageClient, UploadFileResult } from "../../create-client";
import { resolveThrowOnError } from "../../shared/resolve-throw-on-error";
import { normalizeStorageError } from "./storage-error";

type UploadStatus = "idle" | "loading" | "success" | "error";

type UploadState = {
	isLoading: boolean;
	progress: number;
	error: StorageError | null;
	data: UploadFileResult | null;
	status: UploadStatus;
};

type UploadStateActions = {
	reset: () => void;
	setLoading: () => void;
	setProgress: (value: number) => void;
	setSuccess: (value: UploadFileResult) => void;
	setFailure: (value: StorageError) => void;
};

type UploadCallbacks = {
	onProgress?: (progress: number) => void;
	onSuccess?: (result: UploadFileResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError: boolean;
};

type UploadExecution<T extends InferredTypes> = {
	client: BaseStorageClient<T>;
	file: File;
	metadata: StandardSchemaV1.InferInput<T["metadata"]>;
	actions: UploadStateActions;
	callbacks: UploadCallbacks;
};

export interface UseUploadOptions {
	onProgress?: (progress: number) => void;
	onSuccess?: (result: UploadFileResult) => void;
	onError?: (error: StorageError) => void;
	throwOnError?: boolean;
}

type UseUploadReturn<T extends InferredTypes> = {
	state: UploadState;
	upload: (
		file: File,
		metadata: StandardSchemaV1.InferInput<T["metadata"]>,
	) => Promise<void>;
	reset: () => void;
};

type UseUploadHook<T extends InferredTypes> = (
	options?: UseUploadOptions,
) => UseUploadReturn<T>;

const initialUploadState: UploadState = {
	isLoading: false,
	progress: 0,
	error: null,
	data: null,
	status: "idle",
};

function useUploadState(): { state: UploadState; actions: UploadStateActions } {
	const [state, setState] = useState<UploadState>(initialUploadState);

	const reset = useCallback((): void => {
		setState(initialUploadState);
	}, []);

	const setLoading = useCallback((): void => {
		setState((current) => ({ ...current, isLoading: true, status: "loading" }));
	}, []);

	const setProgress = useCallback((value: number): void => {
		setState((current) => ({ ...current, progress: value }));
	}, []);

	const setSuccess = useCallback((value: UploadFileResult): void => {
		setState((current) => ({
			...current,
			isLoading: false,
			data: value,
			status: "success",
		}));
	}, []);

	const setFailure = useCallback((value: StorageError): void => {
		setState((current) => ({
			...current,
			isLoading: false,
			error: value,
			status: "error",
		}));
	}, []);

	return {
		state,
		actions: { reset, setLoading, setProgress, setSuccess, setFailure },
	};
}

async function executeUpload<T extends InferredTypes>(
	input: UploadExecution<T>,
): Promise<void> {
	const { client, file, metadata, actions, callbacks } = input;
	try {
		actions.reset();
		actions.setLoading();
		const result = await client.uploadFile(file, metadata, {
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
			"Upload failed unexpectedly",
		);
		actions.setFailure(storageError);
		callbacks.onError?.(storageError);
		if (callbacks.throwOnError) {
			throw storageError;
		}
	}
}

function useUploadHandler<T extends InferredTypes>(
	client: BaseStorageClient<T>,
	callbacks: UploadCallbacks,
	actions: UploadStateActions,
): (
	file: File,
	metadata: StandardSchemaV1.InferInput<T["metadata"]>,
) => Promise<void> {
	return useCallback(
		async (
			file: File,
			metadata: StandardSchemaV1.InferInput<T["metadata"]>,
		): Promise<void> => {
			await executeUpload({
				client,
				file,
				metadata,
				actions,
				callbacks,
			});
		},
		[client, actions, callbacks],
	);
}

function useUploadInternal<T extends InferredTypes>(
	client: BaseStorageClient<T>,
	options?: UseUploadOptions,
): UseUploadReturn<T> {
	const { onProgress, onSuccess, onError, throwOnError } = options ?? {};
	const { state, actions } = useUploadState();

	const shouldThrow = resolveThrowOnError(
		throwOnError,
		client["~options"].throwOnError,
	);

	const upload = useUploadHandler(
		client,
		{ onProgress, onSuccess, onError, throwOnError: shouldThrow },
		actions,
	);

	return { state, upload, reset: actions.reset };
}

export function createUseUpload<T extends InferredTypes>(
	client: BaseStorageClient<T>,
): UseUploadHook<T> {
	return function useUpload(options?: UseUploadOptions): UseUploadReturn<T> {
		return useUploadInternal(client, options);
	};
}
