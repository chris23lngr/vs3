import { useCallback, useState } from "react";
import type { StandardSchemaV1 } from "../../types/standard-schema";
import type { StorageClientOptions } from "../types";

export function createStorageClient<
	M extends StandardSchemaV1 = StandardSchemaV1,
>(options?: StorageClientOptions<M>) {
	return {
		useUpload: createUseUpload<M>(options),
	};
}

const client = createStorageClient();

type UploadStatus = "idle" | "loading" | "success" | "error";

interface UseUploadOptions<M extends StandardSchemaV1> {
	onProgress: (progress: number) => void;
	onSuccess: () => void;
	onError: (error: unknown) => void;
}

function createUseUpload<M extends StandardSchemaV1>(
	clientOptions?: StorageClientOptions<M>,
) {
	return function useUpload<M extends StandardSchemaV1>(
		options?: UseUploadOptions<M>,
	) {
		const { onProgress, onSuccess, onError } = options ?? {};

		const [isLoading, setIsLoading] = useState<boolean>(false);
		const [progress, setProgress] = useState<number>(0);
		const [error, setError] = useState<unknown>(null);
		const [data, setData] = useState<unknown>(null);
		const [status, setStatus] = useState<UploadStatus>("idle");

		const resetState = useCallback(() => {
			setIsLoading(false);
			setProgress(0);
			setError(undefined);
			setData(undefined);
			setStatus("idle");
		}, []);

		const upload = useCallback(
			async (file: File, metadata: M) => {
				try {
					resetState();
				} catch (error) {
					setError(error);
					setStatus("error");
					throw error;
				}
			},
			[resetState],
		);
	};
}
