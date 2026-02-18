import { Readable } from "node:stream";
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
	RequestHandler,
} from "express";

export type WebHandler = (req: Request) => Promise<Response>;

function hasBody(method: string): boolean {
	return !["GET", "HEAD"].includes(method.toUpperCase());
}

function buildRequestUrl(req: ExpressRequest): string {
	const protocol = req.protocol ?? "http";
	const host = req.get("host") ?? "localhost";
	return `${protocol}://${host}${req.originalUrl ?? req.url}`;
}

async function sendResponse(
	webResponse: Response,
	res: ExpressResponse,
): Promise<void> {
	res.status(webResponse.status);
	webResponse.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});
	if (webResponse.body === null) {
		res.end();
		return;
	}
	Readable.fromWeb(
		webResponse.body as import("node:stream/web").ReadableStream,
	).pipe(res);
}

/**
 * Converts a Web `Request -> Response` handler into an Express middleware.
 * Mount at the path your client calls (e.g. `/api/storage`).
 *
 * @example
 * ```ts
 * import express from "express";
 * import { toExpressHandler } from "vs3/integrations/express";
 * import { storage } from "./storage";
 *
 * const app = express();
 * app.use("/api/storage", toExpressHandler(storage.handler));
 * ```
 */
export function toExpressHandler(handler: WebHandler): RequestHandler {
	return async (
		req: ExpressRequest,
		res: ExpressResponse,
		next: (err?: unknown) => void,
	): Promise<void> => {
		try {
			const url = buildRequestUrl(req);
			const init: RequestInit = {
				method: req.method,
				headers: new Headers(req.headers as Record<string, string>),
			};
			if (hasBody(req.method)) {
				init.body = Readable.toWeb(req as unknown as Readable) as BodyInit;
			}
			const webRequest = new Request(url, init);
			const webResponse = await handler(webRequest);
			await sendResponse(webResponse, res);
		} catch (err) {
			next(err);
		}
	};
}
