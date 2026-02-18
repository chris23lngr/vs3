import { Readable } from "node:stream";
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
	RequestHandler,
} from "express";

export type WebHandler = (req: Request) => Promise<Response>;

type RequestHeaders = Record<string, string | string[] | undefined>;
type ParsedBody = { body?: unknown };
type DuplexRequestInit = RequestInit & { duplex?: "half" };

function hasBody(method: string): boolean {
	return !["GET", "HEAD"].includes(method.toUpperCase());
}

function toWebHeaders(headers: RequestHeaders): Headers {
	const result = new Headers();
	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const entry of value) {
				result.append(key, entry);
			}
			continue;
		}
		result.set(key, value);
	}
	return result;
}

function toBodyInit(value: unknown): BodyInit | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") return value;
	if (
		value instanceof URLSearchParams ||
		value instanceof FormData ||
		value instanceof Blob ||
		value instanceof ReadableStream ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value)
	) {
		return value as BodyInit;
	}
	return JSON.stringify(value);
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
	const buffer = Buffer.from(await webResponse.arrayBuffer());
	res.end(buffer);
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
			const init: DuplexRequestInit = {
				method: req.method,
				headers: toWebHeaders(req.headers),
			};
			if (hasBody(req.method)) {
				const parsedBody = toBodyInit((req as ParsedBody).body);
				if (parsedBody !== undefined) {
					init.body = parsedBody;
					if (parsedBody instanceof ReadableStream) init.duplex = "half";
				} else {
					init.body = Readable.toWeb(req as unknown as Readable) as BodyInit;
					init.duplex = "half";
				}
			}
			const webRequest = new Request(url, init);
			const webResponse = await handler(webRequest);
			await sendResponse(webResponse, res);
		} catch (err) {
			next(err);
		}
	};
}
