import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";

export type WebHandler = (req: Request) => Promise<Response>;

type RequestHeaders = Record<string, string | string[] | undefined>;
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

function buildRequestUrl(req: FastifyRequest): string {
	const proto = req.headers["x-forwarded-proto"];
	const protocol = Array.isArray(proto) ? proto[0] : (proto ?? "http");
	const host = req.headers.host ?? "localhost";
	const url = req.url ?? "/";
	return `${protocol}://${host}${url}`;
}

async function sendResponse(
	webResponse: Response,
	reply: FastifyReply,
): Promise<void> {
	reply.status(webResponse.status);
	webResponse.headers.forEach((value, key) => {
		reply.header(key, value);
	});
	if (webResponse.body === null) {
		await reply.send();
		return;
	}
	const buffer = Buffer.from(await webResponse.arrayBuffer());
	return reply.send(buffer);
}

/**
 * Converts a Web `Request -> Response` handler into a Fastify route handler.
 * Register at the path your client calls (e.g. `/api/storage/*`).
 *
 * @example
 * ```ts
 * import Fastify from "fastify";
 * import { toFastifyHandler } from "vs3/integrations/fastify";
 * import { storage } from "./storage";
 *
 * const fastify = Fastify();
 * fastify.all("/api/storage/*", toFastifyHandler(storage.handler));
 * ```
 */
export function toFastifyHandler(
	handler: (req: Request) => Promise<Response>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
	return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
		const url = buildRequestUrl(request);
		const init: DuplexRequestInit = {
			method: request.method,
			headers: toWebHeaders(request.headers as RequestHeaders),
		};
		if (hasBody(request.method ?? "")) {
			const parsedBody = toBodyInit(request.body);
			if (parsedBody !== undefined) {
				init.body = parsedBody;
				if (parsedBody instanceof ReadableStream) init.duplex = "half";
			} else {
				init.body = Readable.toWeb(request.raw as unknown as Readable) as BodyInit;
				init.duplex = "half";
			}
		}
		const webRequest = new Request(url, init);
		const webResponse = await handler(webRequest);
		await sendResponse(webResponse, reply);
	};
}
