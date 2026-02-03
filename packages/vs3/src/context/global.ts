import type { AsyncLocalStorage } from "../core/async_hooks";

interface Vs3Global {
	/**
	 * Stores the AsyncLocalStorage instances for each context.
	 */
	context: Record<string, AsyncLocalStorage<unknown>>;
}

const symbol = Symbol.for("vs3:global");
let _bind: Vs3Global | null = null;

const __context: Record<string, AsyncLocalStorage<unknown>> = {};

export function __getVs3Global(): Vs3Global {
	if (!(globalThis as any)[symbol]) {
		(globalThis as any)[symbol] = {
			epoch: 1,
			context: __context,
		};
		_bind = (globalThis as any)[symbol] as Vs3Global;
	}
	_bind = (globalThis as any)[symbol] as Vs3Global;
	return (globalThis as any)[symbol] as Vs3Global;
}
