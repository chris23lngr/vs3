import type { StorageOptions } from "./options";

export type StorageContext<O extends StorageOptions = StorageOptions> = {
	readonly $options: O;
};
