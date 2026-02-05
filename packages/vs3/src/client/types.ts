import type { StandardSchemaV1 } from "../types/standard-schema";

export type StorageClientOptions<
	M extends StandardSchemaV1 = StandardSchemaV1,
> = {
	baseURL?: string;
	apiPath?: string;
	metadataSchema?: M;
};
