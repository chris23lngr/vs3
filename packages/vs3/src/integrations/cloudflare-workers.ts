export type WebHandler = (req: Request) => Promise<Response>;

/**
 * The vs3 storage handler is already compatible with Cloudflare Workers.
 * Use this helper for explicit typing and discoverability.
 *
 * @example
 * ```ts
 * // src/index.ts (Cloudflare Workers)
 * import { toCloudflareWorkerHandler } from "vs3/integrations/cloudflare-workers";
 * import { storage } from "./storage";
 *
 * export default {
 *   fetch: toCloudflareWorkerHandler(storage.handler),
 * };
 * ```
 */
export function toCloudflareWorkerHandler(
	handler: WebHandler,
): (request: Request) => Promise<Response> {
	return handler;
}
