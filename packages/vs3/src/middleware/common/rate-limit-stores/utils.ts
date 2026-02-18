export const DEFAULT_KEY_PREFIX = "rl:";

export function toStorageKey(prefix: string, key: string): string {
	return `${prefix}${key}`;
}
