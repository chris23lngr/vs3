import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";

export type WebHandler = (req: Request) => Promise<Response>;

function hasBody(method: string): boolean {
	return !["GET", "HEAD"].includes(method.toUpperCase());
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
	const nodeStream = Readable.fromWeb(
		webResponse.body as import("node:stream/web").ReadableStream,
	);
	return reply.send(nodeStream);
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
		const init: RequestInit = {
			method: request.method,
			headers: new Headers(request.headers as Record<string, string>),
		};
		if (hasBody(request.method ?? "")) {
			init.body = Readable.toWeb(request.raw as unknown as Readable) as BodyInit;
		}
		const webRequest = new Request(url, init);
		const webResponse = await handler(webRequest);
		await sendResponse(webResponse, reply);
	};
}
