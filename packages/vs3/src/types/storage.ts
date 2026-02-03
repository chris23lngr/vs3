import type { StorageAPI } from "./api";
import type { StorageOptions } from "./options";

export type Storage<O extends StorageOptions> = {
	api: StorageAPI<O>;

	handler: (req: Request) => Promise<Response>;

	"~options": O;
};
