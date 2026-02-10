import { createStorageClient } from "vs3/vue";

const storageClient = createStorageClient({
	apiPath: "/api/storage",
	maxFileSize: 5 * 1024 * 1024,
});

export function useStorageClient() {
	return storageClient;
}
