import { getEndpoints, router } from "../api";
import { createContext } from "../context/create-context";
import type { StorageOptions } from "../types/options";
import type { Storage } from "../types/storage";

export function createStorage<O extends StorageOptions>(options: O) {
	const context = createContext(options);

	const { api } = getEndpoints(context, options);

	const { handler } = router(options, context);

	return {
		api,
		handler,
		"~options": options,
	} satisfies Storage<O>;
}
