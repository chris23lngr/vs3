import { describe, expectTypeOf, it } from "vitest";
import { toCloudflareWorkerHandler } from "./cloudflare-workers";
import { toExpressHandler } from "./express";
import { toFastifyHandler } from "./fastify";
import { toH3Handler } from "./h3";
import { toNextJsRouteHandler } from "./next-js";

const webHandler = async (req: Request): Promise<Response> =>
	new Response(undefined, { status: 200 });

describe("integrations", () => {
	describe("toNextJsRouteHandler", () => {
		it("accepts Web handler and returns route exports", () => {
			const routes = toNextJsRouteHandler({ handler: webHandler });
			expectTypeOf(routes.GET).toEqualTypeOf<typeof webHandler>();
			expectTypeOf(routes.POST).toEqualTypeOf<typeof webHandler>();
		});
	});

	describe("toH3Handler", () => {
		it("accepts Web handler and returns H3-compatible handler", () => {
			const h3Handler = toH3Handler(webHandler);
			expectTypeOf(h3Handler).toBeFunction();
		});
	});

	describe("toExpressHandler", () => {
		it("accepts Web handler and returns Express RequestHandler", () => {
			const expressHandler = toExpressHandler(webHandler);
			expectTypeOf(expressHandler).toBeFunction();
		});
	});

	describe("toFastifyHandler", () => {
		it("accepts Web handler and returns Fastify route handler", () => {
			const fastifyHandler = toFastifyHandler(webHandler);
			expectTypeOf(fastifyHandler).toBeFunction();
		});
	});

	describe("toCloudflareWorkerHandler", () => {
		it("accepts Web handler and returns fetch-compatible handler", () => {
			const cfHandler = toCloudflareWorkerHandler(webHandler);
			expectTypeOf(cfHandler).toEqualTypeOf<
				(request: Request) => Promise<Response>
			>();
		});
	});
});
