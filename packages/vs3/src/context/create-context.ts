import type { StorageContext } from "../types/context";
import type { StorageOptions } from "../types/options";

export function createContext<O extends StorageOptions>(
	options: O,
): StorageContext<O> {
	const bucket = options.bucket;
	const adapter = options.adapter;
	const adapterWithBucket = {
		...adapter,
		generatePresignedUploadUrl: (
			key: Parameters<typeof adapter.generatePresignedUploadUrl>[0],
			fileInfo: Parameters<typeof adapter.generatePresignedUploadUrl>[1],
			requestOptions?: Parameters<typeof adapter.generatePresignedUploadUrl>[2],
		) =>
			adapter.generatePresignedUploadUrl(key, fileInfo, {
				...requestOptions,
				bucket: requestOptions?.bucket ?? bucket,
			}),
		generatePresignedDownloadUrl: (
			key: Parameters<typeof adapter.generatePresignedDownloadUrl>[0],
			requestOptions?: Parameters<typeof adapter.generatePresignedDownloadUrl>[1],
		) =>
			adapter.generatePresignedDownloadUrl(key, {
				...requestOptions,
				bucket: requestOptions?.bucket ?? bucket,
			}),
		deleteObject: (
			key: Parameters<typeof adapter.deleteObject>[0],
			requestOptions?: Parameters<typeof adapter.deleteObject>[1],
		) =>
			adapter.deleteObject(key, {
				...requestOptions,
				bucket: requestOptions?.bucket ?? bucket,
			}),
	};

	return {
		$options: {
			...options,
			adapter: adapterWithBucket,
		},
	};
}
