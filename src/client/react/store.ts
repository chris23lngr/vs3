import { atom } from "nanostores";
import type { StorageOptions } from "../../types/options";
import type { Storage } from "../../types/storage";
import { createStorageClient, createStorageClientFromServer } from "../client";
import type {
	ClientSchema,
	StorageClient,
	StorageClientOptions,
} from "../types";

export const $storageClient = atom<StorageClient<any> | null>(null);

export function setStorageClient(client: StorageClient<any>) {
	$storageClient.set(client);
}

export function getStorageClient(): StorageClient<any> {
	const client = $storageClient.get();
	if (!client) {
		throw new Error(
			"Storage client is not initialized. Call initStorageClient() before using hooks.",
		);
	}
	return client;
}

export function initStorageClient<M extends ClientSchema>(
	options: StorageClientOptions<M>,
): StorageClient<M> {
	const client = createStorageClient(options);
	$storageClient.set(client as StorageClient<any>);
	return client;
}

export function initStorageClientFromServer<O extends StorageOptions>(
	storage: Storage<O>,
	options?: Omit<StorageClientOptions<O["metadataSchema"]>, "metadataSchema">,
): StorageClient<O["metadataSchema"]> {
	const client = createStorageClientFromServer(storage, options);
	$storageClient.set(client as StorageClient<any>);
	return client;
}
