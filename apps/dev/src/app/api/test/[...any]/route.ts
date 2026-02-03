export const GET = (req: Request) => {
	console.log("GET /api/test", req);

	const url = new URL(req.url);
	const path = url.pathname;

	return new Response(`Hello, world, from ${path}`);
};
