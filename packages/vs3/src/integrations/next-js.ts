export function toNextJsRouteHandler(opts: {
	handler: (req: Request) => Promise<Response>;
}) {
	const handler = (req: Request) => {
		const url = new URL(req.url);
		const path = url.pathname;
		const method = req.method;
		const body = req.body;
		const headers = req.headers;
		const query = url.searchParams;

		console.log("toNextJsRouteHandler", { path, method, body, headers, query });

		return opts.handler(req);
	};

	return {
		GET: handler,
		POST: handler,
		PUT: handler,
		DELETE: handler,
		PATCH: handler,
		OPTIONS: handler,
		HEAD: handler,
		TRACE: handler,
		CONNECT: handler,
		ALL: handler,
	};
}
