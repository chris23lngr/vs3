export function toNextJsRouteHandler({
	handler,
}: {
	handler: (req: Request) => Promise<Response>;
}) {
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
