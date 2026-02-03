import type { EndpointContext, InputContext } from "better-call";
import {
	type AsyncLocalStorage,
	getAsyncLocalStorage,
} from "../core/async_hooks";
import type { StorageContext } from "../types/context";
import { __getVs3Global } from "./global";

export type StorageEndpointContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
> & {
	context: StorageContext;
};

const ensureAsyncStorage = async () => {
	const vs3Global = __getVs3Global();
	if (!vs3Global.context.endpointContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		vs3Global.context.endpointContextAsyncStorage =
			new AsyncLocalStorage<StorageEndpointContext>();
	}
	return vs3Global.context
		.endpointContextAsyncStorage as AsyncLocalStorage<StorageEndpointContext>;
};

export async function getCurrentStorageContext(): Promise<StorageEndpointContext> {
	const als = await ensureAsyncStorage();
	const context = als.getStore();
	if (!context) {
		throw new Error(
			"No storage context found. Please make sure you are calling this function within a `runWithEndpointContext` callback.",
		);
	}
	return context;
}

export async function runWithEndpointContext<T>(
	context: StorageEndpointContext,
	fn: () => T,
): Promise<T> {
	const als = await ensureAsyncStorage();
	return als.run(context, fn);
}
