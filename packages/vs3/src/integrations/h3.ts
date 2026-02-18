import { fromWebHandler } from "h3";

export type WebHandler = (req: Request) => Promise<Response>;

/**
 * Converts a Web `Request -> Response` handler into an H3 event handler.
 * Use with Nitro/Nuxt server routes or standalone H3 apps.
 *
 * @example
 * ```ts
 * // server/api/storage/[...all].ts (Nuxt)
 * import { toH3Handler } from "vs3/integrations/h3";
 * import { storage } from "../../storage";
 * export default toH3Handler(storage.handler);
 * ```
 */
export function toH3Handler(
	handler: WebHandler,
): ReturnType<typeof fromWebHandler> {
	return fromWebHandler(handler);
}
