import { useCallback, useState } from "react";
import type { StandardSchemaV1 } from "../../../types/standard-schema";
import type { BaseStorageClient } from "../../create-client";

type UploadStatus = "idle" | "loading" | "success" | "error";

export interface UseUploadOptions {
	onProgress: (progress: number) => void;
	onSuccess: () => void;
	onError: (error: unknown) => void;
}

export function createUseUpload<M extends StandardSchemaV1>(
	client: BaseStorageClient<M>,
) {
	return function useUpload<M extends StandardSchemaV1>(
		options?: UseUploadOptions,
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
			async (file: File, metadata: StandardSchemaV1.InferInput<M>) => {
				try {
					resetState();

					setStatus("loading");

					const res = await client.uploadFile(file, metadata, {
						onProgress: (progress) => {
							setProgress(progress);
							onProgress?.(progress);
						},
						onSuccess: ({ key, presignedUrl }) => {
							setData({
								key,
								presignedUrl,
							});
							setStatus("success");
							onSuccess?.();
						},
					});

					setIsLoading(false);
					setData(res);
				} catch (error) {
					setError(error);
					setStatus("error");
					onError?.(error);
					throw error;
				}
			},
			[resetState, onProgress, onSuccess, onError],
		);

		return {
			state: {
				isLoading,
				progress,
				error,
				data,
				status,
			},
			upload,
			reset: resetState,
		};
	};
}
